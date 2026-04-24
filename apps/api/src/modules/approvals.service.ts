import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  type AdminRoutingConfig,
  type AdminDelegationConfig,
  type PolicyCheckResult,
  approvalQueueResponseSchema,
  type ApprovalQueueItem,
} from "@finance-ops/shared";
import { AdminConfigService } from "./admin-config.service";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "./prisma.service";
import { UserDirectoryService } from "./user-directory.service";

function toIsoDateTimeString(value: Date | string | null | undefined) {
  if (value === null || value === undefined) {
    return value;
  }
  return typeof value === "string" ? value : value.toISOString();
}

type StageMode = "SEQUENTIAL" | "PARALLEL";
type StageDependencyType = "ALL_REQUIRED" | "ANY_ONE" | "MIN_N";

type MatrixStageDefinition = {
  stageNumber: number;
  stageMode: StageMode;
  stageLabel: string;
  approverIds: string[];
  dependencyType: StageDependencyType;
  requiredApprovals: number;
  slaHours?: number;
  escalatesTo?: string;
};

@Injectable()
export class ApprovalsService implements OnModuleInit, OnModuleDestroy {
  private sweepInterval: NodeJS.Timeout | null = null;
  private readonly reminderCooldownByStage = new Map<string, number>();
  private readonly sweepIntervalMs = Number(process.env.APPROVAL_SLA_SWEEP_MS ?? "60000");
  private readonly reminderStateSettingKey = "approvalSlaReminderState";
  private readonly activeTaskStatuses = ["PENDING", "INFO_REQUESTED"] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminConfigService: AdminConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly userDirectoryService: UserDirectoryService,
  ) {}

  onModuleInit() {
    if (!Number.isFinite(this.sweepIntervalMs) || this.sweepIntervalMs < 10000) {
      return;
    }
    this.sweepInterval = setInterval(() => {
      void this.runSlaBreachSweep();
    }, this.sweepIntervalMs);
  }

  onModuleDestroy() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  private async readReminderState(): Promise<Record<string, number>> {
    const setting = await this.prisma.adminSetting.findUnique({ where: { key: this.reminderStateSettingKey } });
    if (!setting || typeof setting.value !== "object" || setting.value === null || Array.isArray(setting.value)) {
      return {};
    }
    const entries = Object.entries(setting.value as Record<string, unknown>)
      .map(([key, value]) => [key, typeof value === "number" ? value : Number.NaN] as const)
      .filter((entry) => Number.isFinite(entry[1]));
    return Object.fromEntries(entries);
  }

  private async writeReminderState(next: Record<string, number>) {
    await this.prisma.adminSetting.upsert({
      where: { key: this.reminderStateSettingKey },
      update: { value: next },
      create: { key: this.reminderStateSettingKey, value: next },
    });
  }

  async createMatrixTasks(input: {
    caseId: string;
    workflowType: string;
    latestExtractionFields?: unknown;
    policyResult: PolicyCheckResult;
    routingConfig: AdminRoutingConfig;
    managerApprovalThreshold: number;
  }) {
    const caseRecord = await this.prisma.case.findUnique({
      where: { id: input.caseId },
      select: { requesterId: true },
    });
    const requester = caseRecord?.requesterId
      ? await this.userDirectoryService.getUserById(caseRecord.requesterId)
      : null;
    const defaultApproverId = requester?.managerUserId ?? input.routingConfig.defaultApproverId;
    const stages: MatrixStageDefinition[] = [
      {
        stageNumber: 1,
        stageMode: "SEQUENTIAL",
        stageLabel: "Manager approval",
        approverIds: [defaultApproverId],
        dependencyType: "ALL_REQUIRED",
        requiredApprovals: 1,
        slaHours: input.routingConfig.escalationWindowHours,
      },
    ];

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.approvalTask.deleteMany({ where: { caseId: input.caseId } });
      await tx.approvalStage.deleteMany({ where: { matrix: { caseId: input.caseId } } });
      await tx.approvalMatrix.deleteMany({ where: { caseId: input.caseId } });

      const matrix = await tx.approvalMatrix.create({
        data: {
          caseId: input.caseId,
          status: "ACTIVE",
          routingReason: input.policyResult.requiresFinanceReview
            ? "policy-finance-review"
            : "policy-approval-matrix",
        },
      });

      const tasks = [];
      for (const stage of stages) {
        const createdStage = await tx.approvalStage.create({
          data: {
            matrixId: matrix.id,
            stageNumber: stage.stageNumber,
            mode: stage.stageMode,
            dependencyType: stage.dependencyType,
            label: stage.stageLabel,
            status: stage.stageNumber === 1 ? "ACTIVE" : "BLOCKED",
            requiredApprovals:
              stage.dependencyType === "ALL_REQUIRED"
                ? stage.approverIds.length
                : Math.max(1, Math.min(stage.requiredApprovals, stage.approverIds.length)),
            slaHours: stage.slaHours ?? null,
            dueAt: stage.slaHours ? new Date(Date.now() + stage.slaHours * 60 * 60 * 1000) : null,
            escalatesTo: stage.escalatesTo ?? null,
          },
        });

        for (const approverId of stage.approverIds) {
          const task = await tx.approvalTask.create({
            data: {
              caseId: input.caseId,
              stageId: createdStage.id,
              approverId,
              stageNumber: stage.stageNumber,
              stageMode: stage.stageMode,
              stageLabel: stage.stageLabel,
              status: stage.stageNumber === 1 ? "PENDING" : "BLOCKED",
              dueAt: createdStage.dueAt,
            },
          });
          tasks.push(task);
        }
      }

      return tasks;
    });
    await this.applyAutoDelegation(input.caseId, 1);
    return created;
  }

  async createTask(caseId: string, approverId: string) {
    return this.prisma.approvalTask.create({
      data: {
        caseId,
        approverId,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  async listPendingTasks(userId?: string, includeAll = false): Promise<ApprovalQueueItem[]> {
    if ("approvalStage" in this.prisma && this.prisma.approvalStage) {
      await this.runSlaBreachSweep();
    }
    const tasks = await this.prisma.approvalTask.findMany({
      where:
        includeAll || !userId
          ? { status: "PENDING" }
          : { status: "PENDING", approverId: userId },
      orderBy: { createdAt: "asc" },
      include: { case: true, stage: true },
    });

    return approvalQueueResponseSchema.parse(
      tasks.map((task) => ({
        id: task.id,
        caseId: task.caseId,
        approverId: task.approverId,
        ...(task.stageNumber !== undefined ? { stageNumber: task.stageNumber } : {}),
        ...(task.stageMode ? { stageMode: task.stageMode } : {}),
        ...(task.stageLabel ? { stageLabel: task.stageLabel } : {}),
        ...(task.stage?.dependencyType ? { stageDependencyType: task.stage.dependencyType } : {}),
        ...(task.stage?.requiredApprovals !== undefined ? { stageRequiredApprovals: task.stage.requiredApprovals } : {}),
        ...(task.stage?.slaHours !== undefined ? { stageSlaHours: task.stage.slaHours } : {}),
        ...(task.stage?.dueAt !== undefined ? { stageDueAt: toIsoDateTimeString(task.stage.dueAt) } : {}),
        ...(task.stage?.escalatesTo !== undefined ? { stageEscalatesTo: task.stage.escalatesTo } : {}),
        ...(task.stage?.escalatedAt !== undefined ? { stageEscalatedAt: toIsoDateTimeString(task.stage.escalatedAt) } : {}),
        ...(task.delegatedFrom ? { delegatedFrom: task.delegatedFrom } : {}),
        ...(task.actingApproverId ? { actingApproverId: task.actingApproverId } : {}),
        status: task.status,
        decision: task.decision,
        decisionReason: task.decisionReason,
        dueAt: toIsoDateTimeString(task.dueAt),
        createdAt: toIsoDateTimeString(task.createdAt),
        updatedAt: toIsoDateTimeString(task.updatedAt),
        case: {
          id: task.case.id,
          workflowType: task.case.workflowType,
          status: task.case.status,
          priority: task.case.priority,
          requesterId: task.case.requesterId,
          createdAt: toIsoDateTimeString(task.case.createdAt),
          updatedAt: toIsoDateTimeString(task.case.updatedAt),
        },
      })),
    );
  }

  async getTask(taskId: string) {
    return this.prisma.approvalTask.findUnique({
      where: { id: taskId },
      include: { case: true },
    });
  }

  async getLatestInfoRequestedTask(caseId: string) {
    return this.prisma.approvalTask.findFirst({
      where: {
        caseId,
        status: "INFO_REQUESTED",
      },
      orderBy: { createdAt: "desc" },
      include: { case: true },
    });
  }

  async markApproved(taskId: string, decisionReason?: string, actingApproverId?: string) {
    return this.prisma.approvalTask.update({
      where: { id: taskId },
      data: {
        status: "APPROVED",
        decision: "APPROVED",
        decisionReason,
        actingApproverId: actingApproverId ?? null,
      },
    });
  }

  async markRejected(taskId: string, decisionReason?: string, actingApproverId?: string) {
    return this.prisma.approvalTask.update({
      where: { id: taskId },
      data: {
        status: "REJECTED",
        decision: "REJECTED",
        decisionReason,
        actingApproverId: actingApproverId ?? null,
      },
    });
  }

  async requestInfo(taskId: string, decisionReason?: string, actingApproverId?: string) {
    return this.prisma.approvalTask.update({
      where: { id: taskId },
      data: {
        status: "INFO_REQUESTED",
        decision: "REQUEST_INFO",
        decisionReason,
        actingApproverId: actingApproverId ?? null,
      },
    });
  }

  async reopenTask(taskId: string) {
    return this.prisma.approvalTask.update({
      where: { id: taskId },
      data: {
        status: "PENDING",
        decision: null,
        decisionReason: null,
      },
    });
  }

  async activateNextStage(caseId: string, completedStageNumber: number): Promise<{ activated: boolean; nextStage?: number }> {
    const blocked = await this.prisma.approvalTask.findMany({
      where: {
        caseId,
        stageNumber: { gt: completedStageNumber },
        status: "BLOCKED",
      },
      orderBy: [{ stageNumber: "asc" }, { createdAt: "asc" }],
    });
    if (!blocked.length) {
      return { activated: false };
    }
    const nextStage = blocked[0].stageNumber;
    await this.prisma.approvalTask.updateMany({
      where: { caseId, stageNumber: nextStage, status: "BLOCKED" },
      data: { status: "PENDING" },
    });
    await this.prisma.approvalStage.updateMany({
      where: {
        matrix: { caseId },
        stageNumber: nextStage,
      },
      data: { status: "ACTIVE" },
    });
    await this.applyAutoDelegation(caseId, nextStage);
    const activatedTasks = await this.prisma.approvalTask.findMany({
      where: { caseId, stageNumber: nextStage, status: "PENDING" },
      select: { approverId: true },
    });
    await this.notifyApprovalRequired(
      caseId,
      [...new Set(activatedTasks.map((task) => task.approverId))],
      "Approval required",
      `Case ${caseId} moved to stage ${nextStage}. Your approval is now required.`,
    );
    return { activated: true, nextStage };
  }

  async getStageStatus(caseId: string, stageNumber: number): Promise<"APPROVED" | "REJECTED" | "PENDING"> {
    const stage = await this.prisma.approvalStage.findFirst({
      where: { matrix: { caseId }, stageNumber },
    });
    const tasks = await this.prisma.approvalTask.findMany({
      where: { caseId, stageNumber },
    });
    if (!tasks.length) {
      return "PENDING";
    }

    const dependencyType = (stage?.dependencyType as StageDependencyType | undefined) ?? "ALL_REQUIRED";
    const requiredApprovals = Math.max(1, stage?.requiredApprovals ?? tasks.length);
    const approvedCount = tasks.filter((task) => task.status === "APPROVED").length;
    const rejectedCount = tasks.filter((task) => task.status === "REJECTED").length;
    const inProgressCount = tasks.filter((task) =>
      task.status === "PENDING" || task.status === "INFO_REQUESTED" || task.status === "BLOCKED",
    ).length;

    let resolvedStatus: "APPROVED" | "REJECTED" | "PENDING" = "PENDING";
    if (dependencyType === "ALL_REQUIRED") {
      if (rejectedCount > 0) {
        resolvedStatus = "REJECTED";
      } else if (approvedCount === tasks.length) {
        resolvedStatus = "APPROVED";
      }
    } else if (dependencyType === "ANY_ONE") {
      if (approvedCount >= 1) {
        resolvedStatus = "APPROVED";
      } else if (inProgressCount === 0) {
        resolvedStatus = "REJECTED";
      }
    } else {
      if (approvedCount >= requiredApprovals) {
        resolvedStatus = "APPROVED";
      } else if (approvedCount + inProgressCount < requiredApprovals) {
        resolvedStatus = "REJECTED";
      }
    }

    if (resolvedStatus === "REJECTED") {
      await this.prisma.approvalStage.updateMany({
        where: { matrix: { caseId }, stageNumber },
        data: { status: "REJECTED" },
      });
      return resolvedStatus;
    }
    if (resolvedStatus === "APPROVED") {
      await this.prisma.approvalStage.updateMany({
        where: { matrix: { caseId }, stageNumber },
        data: { status: "APPROVED" },
      });
      return resolvedStatus;
    }
    await this.prisma.approvalStage.updateMany({
      where: { matrix: { caseId }, stageNumber },
      data: { status: "ACTIVE" },
    });
    return "PENDING";
  }

  async cancelRemaining(caseId: string, excludeTaskId: string) {
    await this.prisma.approvalTask.updateMany({
      where: {
        caseId,
        id: { not: excludeTaskId },
        status: { in: ["PENDING", "BLOCKED", "INFO_REQUESTED"] },
      },
      data: {
        status: "CANCELLED",
      },
    });
  }

  async delegateTask(input: {
    taskId: string;
    fromApproverId: string;
    toApproverId: string;
    reason?: string;
  }) {
    const updatedTask = await this.prisma.approvalTask.update({
      where: { id: input.taskId },
      data: {
        approverId: input.toApproverId,
        delegatedFrom: input.fromApproverId,
        decisionReason: input.reason
          ? `Delegated from ${input.fromApproverId} to ${input.toApproverId}: ${input.reason}`
          : `Delegated from ${input.fromApproverId} to ${input.toApproverId}.`,
        actingApproverId: null,
      },
    });
    await this.notifyApprovalRequired(
      updatedTask.caseId,
      [input.toApproverId],
      "Approval task delegated to you",
      `Case ${updatedTask.caseId} approval task ${input.taskId} was delegated to you from ${input.fromApproverId}.`,
    );
    return updatedTask;
  }

  private async notifyApprovalRequired(caseId: string, approverIds: string[], subject: string, body: string) {
    const recipients = [...new Set(approverIds.filter((recipientId) => recipientId.trim().length > 0))];
    for (const recipientId of recipients) {
      await this.notificationsService.send({
        type: "approval-required",
        recipientId,
        subject,
        body,
        caseId,
      });
    }
  }

  private async getDelegationConfig(): Promise<AdminDelegationConfig> {
    return this.adminConfigService.getDelegationConfig();
  }

  async applyAutoDelegation(caseId: string, stageNumber?: number) {
    const config = await this.getDelegationConfig();
    if (!config.rules.length) {
      return;
    }
    const now = Date.now();
    const activeRules = config.rules.filter((rule) => {
      if (!rule.enabled) {
        return false;
      }
      if (!rule.outOfOfficeUntil) {
        return true;
      }
      const untilMs = Date.parse(rule.outOfOfficeUntil);
      return Number.isFinite(untilMs) && untilMs > now;
    });
    if (!activeRules.length) {
      return;
    }

    const where: {
      caseId: string;
      stageNumber?: number;
      status: { in: string[] };
      approverId: string;
    } = {
      caseId,
      status: { in: ["PENDING", "INFO_REQUESTED"] },
      approverId: "",
    };

    for (const rule of activeRules) {
      if (rule.approverId === rule.delegateTo) {
        continue;
      }
      await this.prisma.approvalTask.updateMany({
        where: {
          ...where,
          ...(stageNumber ? { stageNumber } : {}),
          approverId: rule.approverId,
        },
        data: {
          approverId: rule.delegateTo,
          delegatedFrom: rule.approverId,
          decisionReason: rule.note
            ? `Auto-delegated (OOO) to ${rule.delegateTo}: ${rule.note}`
            : `Auto-delegated (OOO) to ${rule.delegateTo}.`,
          actingApproverId: null,
        },
      });
      const delegatedTasks = await this.prisma.approvalTask.count({
        where: {
          caseId,
          ...(stageNumber ? { stageNumber } : {}),
          approverId: rule.delegateTo,
          delegatedFrom: rule.approverId,
          status: { in: [...this.activeTaskStatuses] },
        },
      });
      if (delegatedTasks > 0) {
        await this.notifyApprovalRequired(
          caseId,
          [rule.delegateTo],
          "Approval task auto-delegated to you",
          `Case ${caseId} has ${delegatedTasks} approval task${delegatedTasks === 1 ? "" : "s"} auto-delegated to you.`,
        );
      }
    }
  }

  async runSlaBreachSweep(): Promise<{ escalatedStages: number; escalatedTasks: number; reminderCandidates: number }> {
    const now = new Date();
    const overdueStages = await this.prisma.approvalStage.findMany({
      where: {
        status: "ACTIVE",
        dueAt: { lt: now },
        escalatedAt: null,
        matrix: { status: "ACTIVE" },
      },
      include: {
        matrix: true,
        tasks: {
          where: { status: { in: ["PENDING", "INFO_REQUESTED"] } },
        },
      },
    });

    let escalatedStages = 0;
    let escalatedTasks = 0;
    let reminderCandidates = 0;

    for (const stage of overdueStages) {
      if (!stage.tasks.length) {
        continue;
      }
      if (!stage.escalatesTo) {
        reminderCandidates += 1;
        continue;
      }

      for (const task of stage.tasks) {
        await this.prisma.approvalTask.update({
          where: { id: task.id },
          data: {
            approverId: stage.escalatesTo,
            delegatedFrom: task.approverId,
            decisionReason: `Auto-escalated to ${stage.escalatesTo} after SLA breach.`,
            actingApproverId: null,
          },
        });
        await this.notificationsService.send({
          type: "APPROVAL_SLA_ESCALATED",
          recipientId: stage.escalatesTo,
          subject: `Approval task escalated for case ${stage.matrix.caseId}`,
          body: `Stage ${stage.stageNumber} exceeded SLA. Task ${task.id} is now assigned to you.`,
          caseId: stage.matrix.caseId,
        });
        escalatedTasks += 1;
      }

      await this.prisma.approvalStage.update({
        where: { id: stage.id },
        data: { escalatedAt: now },
      });
      escalatedStages += 1;
    }

    const persistentReminderState = await this.readReminderState();
    const reminderStateChanged: Record<string, number> = { ...persistentReminderState };

    for (const stage of overdueStages.filter((entry) => entry.tasks.length > 0 && !entry.escalatesTo)) {
      const lastReminderAt =
        this.reminderCooldownByStage.get(stage.id) ??
        persistentReminderState[stage.id] ??
        0;
      const cooldownMs = 60 * 60 * 1000;
      if (Date.now() - lastReminderAt < cooldownMs) {
        continue;
      }
      for (const task of stage.tasks) {
        await this.notificationsService.send({
          type: "APPROVAL_SLA_REMINDER",
          recipientId: task.approverId,
          subject: `Approval reminder for case ${stage.matrix.caseId}`,
          body: `Stage ${stage.stageNumber} is overdue and waiting for your decision.`,
          caseId: stage.matrix.caseId,
        });
      }
      const nowTs = Date.now();
      this.reminderCooldownByStage.set(stage.id, nowTs);
      reminderStateChanged[stage.id] = nowTs;
    }

    if (Object.keys(reminderStateChanged).length !== Object.keys(persistentReminderState).length) {
      await this.writeReminderState(reminderStateChanged);
    } else {
      const hasChange = Object.entries(reminderStateChanged).some(([key, value]) => persistentReminderState[key] !== value);
      if (hasChange) {
        await this.writeReminderState(reminderStateChanged);
      }
    }

    return { escalatedStages, escalatedTasks, reminderCandidates };
  }

  async getApprovalAnalytics() {
    const now = Date.now();
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [pendingTasks, blockedTasks, approvedLast7d, rejectedLast7d, delegatedOpenTasks, escalatedStages, overdueActiveStages] =
      await Promise.all([
        this.prisma.approvalTask.count({ where: { status: "PENDING" } }),
        this.prisma.approvalTask.count({ where: { status: "BLOCKED" } }),
        this.prisma.approvalTask.count({
          where: { status: "APPROVED", updatedAt: { gte: last7d } },
        }),
        this.prisma.approvalTask.count({
          where: { status: "REJECTED", updatedAt: { gte: last7d } },
        }),
        this.prisma.approvalTask.count({
          where: { delegatedFrom: { not: null }, status: { in: ["PENDING", "BLOCKED", "INFO_REQUESTED"] } },
        }),
        this.prisma.approvalStage.count({
          where: { escalatedAt: { not: null } },
        }),
        this.prisma.approvalStage.count({
          where: { status: "ACTIVE", dueAt: { lt: new Date() }, escalatedAt: null },
        }),
      ]);

    const approvedTasks = await this.prisma.approvalTask.findMany({
      where: {
        status: "APPROVED",
        updatedAt: { gte: last7d },
      },
      select: {
        createdAt: true,
        updatedAt: true,
      },
    });
    const avgApprovalHours = approvedTasks.length
      ? approvedTasks.reduce((total, task) => total + (task.updatedAt.getTime() - task.createdAt.getTime()), 0) /
        approvedTasks.length /
        (1000 * 60 * 60)
      : null;

    const pendingByStage = await this.prisma.approvalTask.groupBy({
      by: ["stageNumber"],
      where: { status: { in: ["PENDING", "BLOCKED", "INFO_REQUESTED"] } },
      _count: { _all: true },
      orderBy: { _count: { stageNumber: "desc" } },
      take: 1,
    });
    const bottleneckStage =
      pendingByStage[0] && pendingByStage[0].stageNumber !== null
        ? {
            stageNumber: pendingByStage[0].stageNumber,
            pendingCount: pendingByStage[0]._count._all,
          }
        : null;

    return {
      pendingTasks,
      blockedTasks,
      approvedLast7d,
      rejectedLast7d,
      delegatedOpenTasks,
      escalatedStages,
      overdueActiveStages,
      avgApprovalHours,
      bottleneckStage,
    };
  }
}
