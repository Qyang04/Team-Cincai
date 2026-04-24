import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  type AdminApprovalMatrixStageTemplate,
  type AdminRoutingConfig,
  type AdminDelegationConfig,
  type PolicyCheckResult,
  approvalQueueResponseSchema,
  type ApprovalQueueItem,
} from "@finance-ops/shared";
import { AdminConfigService } from "./admin-config.service";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "./prisma.service";

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminConfigService: AdminConfigService,
    private readonly notificationsService: NotificationsService,
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

  private extractAmount(fieldsJson: unknown): number {
    const fields = (fieldsJson as Record<string, unknown> | null | undefined) ?? {};
    return typeof fields.amount === "number" ? fields.amount : 0;
  }

  private extractString(fieldsJson: unknown, key: string): string | null {
    const fields = (fieldsJson as Record<string, unknown> | null | undefined) ?? {};
    const value = fields[key];
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }

  private templateMatches(input: {
    template: AdminApprovalMatrixStageTemplate;
    workflowType: string;
    amount: number;
    department: string | null;
    costCenter: string | null;
  }): boolean {
    const conditions = input.template.conditions;
    if (!conditions) {
      return true;
    }
    if (conditions.workflowTypes?.length && !conditions.workflowTypes.includes(input.workflowType as never)) {
      return false;
    }
    if (conditions.minAmount !== undefined && input.amount < conditions.minAmount) {
      return false;
    }
    if (conditions.maxAmount !== undefined && input.amount > conditions.maxAmount) {
      return false;
    }
    if (conditions.departments?.length) {
      const currentDepartment = input.department?.toLowerCase() ?? "";
      const allowed = conditions.departments.map((value) => value.trim().toLowerCase());
      if (!allowed.includes(currentDepartment)) {
        return false;
      }
    }
    if (conditions.costCenterPrefixes?.length) {
      const currentCostCenter = input.costCenter?.toUpperCase() ?? "";
      const matches = conditions.costCenterPrefixes.some((prefix) =>
        currentCostCenter.startsWith(prefix.trim().toUpperCase()),
      );
      if (!matches) {
        return false;
      }
    }
    return true;
  }

  async createMatrixTasks(input: {
    caseId: string;
    workflowType: string;
    latestExtractionFields?: unknown;
    policyResult: PolicyCheckResult;
    routingConfig: AdminRoutingConfig;
    managerApprovalThreshold: number;
  }) {
    const amount = this.extractAmount(input.latestExtractionFields);
    const defaultApproverId = input.routingConfig.defaultApproverId;
    const financeReviewerId = input.routingConfig.financeReviewerId;
    const directorApproverId = "director.approver";
    const complianceApproverId = "compliance.approver";
    const financeControllerApproverId = "finance.controller";
    const procurementApproverId = "procurement.approver";
    const treasuryApproverId = "treasury.approver";
    const department = this.extractString(input.latestExtractionFields, "department")?.toLowerCase() ?? null;
    const costCenter = this.extractString(input.latestExtractionFields, "costCenter")?.toUpperCase() ?? null;

    let stages: MatrixStageDefinition[] =
      [
        {
          stageNumber: 1,
          stageMode: "SEQUENTIAL",
          stageLabel: "Line manager approval",
          approverIds: [defaultApproverId],
          dependencyType: "ALL_REQUIRED",
          requiredApprovals: 1,
          slaHours: input.routingConfig.escalationWindowHours,
          escalatesTo: directorApproverId,
        },
      ];

    const templateConfig = await this.adminConfigService.getApprovalMatrixConfig();
    const configuredStages = templateConfig.templates
      .filter((template) => template.enabled)
      .sort((a, b) => a.stageOrder - b.stageOrder)
      .filter((template) =>
        this.templateMatches({
          template,
          workflowType: input.workflowType,
          amount,
          department,
          costCenter,
        }),
      )
      .map((template, index) => ({
        stageNumber: index + 1,
        stageMode: template.mode,
        stageLabel: template.label,
        approverIds: template.approverIds,
        dependencyType: template.dependencyType,
        requiredApprovals: template.requiredApprovals ?? 1,
        slaHours: template.slaHours ?? input.routingConfig.escalationWindowHours,
        escalatesTo: template.escalatesTo ?? undefined,
      }));

    if (configuredStages.length) {
      stages = configuredStages;
    }

    if (amount > input.managerApprovalThreshold) {
      stages.push({
        stageNumber: stages.length + 1,
        stageMode: "SEQUENTIAL",
        stageLabel: "Department head approval",
        approverIds: [directorApproverId],
        dependencyType: "ALL_REQUIRED",
        requiredApprovals: 1,
        slaHours: input.routingConfig.escalationWindowHours,
        escalatesTo: financeReviewerId,
      });
    }

    if (input.workflowType === "INTERNAL_PAYMENT_REQUEST") {
      stages.push({
        stageNumber: stages.length + 1,
        stageMode: "PARALLEL",
        stageLabel: "Parallel risk checks",
        approverIds: [complianceApproverId, financeReviewerId],
        dependencyType: "MIN_N",
        requiredApprovals: 1,
        slaHours: input.routingConfig.escalationWindowHours,
      });
    }

    if (input.workflowType === "VENDOR_INVOICE_APPROVAL") {
      stages.push({
        stageNumber: stages.length + 1,
        stageMode: "SEQUENTIAL",
        stageLabel: "Finance coding review",
        approverIds: [financeReviewerId],
        dependencyType: "ALL_REQUIRED",
        requiredApprovals: 1,
        slaHours: input.routingConfig.escalationWindowHours,
      });
    }

    if (department === "procurement") {
      stages.push({
        stageNumber: stages.length + 1,
        stageMode: "SEQUENTIAL",
        stageLabel: "Procurement control sign-off",
        approverIds: [procurementApproverId],
        dependencyType: "ALL_REQUIRED",
        requiredApprovals: 1,
        slaHours: input.routingConfig.escalationWindowHours,
      });
    }

    if (department === "treasury") {
      stages.push({
        stageNumber: stages.length + 1,
        stageMode: "SEQUENTIAL",
        stageLabel: "Treasury liquidity check",
        approverIds: [treasuryApproverId],
        dependencyType: "ALL_REQUIRED",
        requiredApprovals: 1,
        slaHours: input.routingConfig.escalationWindowHours,
      });
    }

    if (costCenter?.startsWith("FIN")) {
      stages.push({
        stageNumber: stages.length + 1,
        stageMode: "PARALLEL",
        stageLabel: "Finance oversight confirmation",
        approverIds: [financeControllerApproverId, financeReviewerId],
        dependencyType: "ANY_ONE",
        requiredApprovals: 1,
        slaHours: input.routingConfig.escalationWindowHours,
        escalatesTo: directorApproverId,
      });
    }

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

  async listPendingTasks(): Promise<ApprovalQueueItem[]> {
    if ("approvalStage" in this.prisma && this.prisma.approvalStage) {
      await this.runSlaBreachSweep();
    }
    const tasks = await this.prisma.approvalTask.findMany({
      where: { status: "PENDING" },
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
    return this.prisma.approvalTask.update({
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
