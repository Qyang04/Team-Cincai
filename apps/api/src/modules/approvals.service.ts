import { Injectable } from "@nestjs/common";
import {
  approvalQueueResponseSchema,
  type ApprovalQueueItem,
} from "@finance-ops/shared";
import { PrismaService } from "./prisma.service";

function toIsoDateTimeString(value: Date | string | null | undefined) {
  if (value === null || value === undefined) {
    return value;
  }
  return typeof value === "string" ? value : value.toISOString();
}

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const tasks = await this.prisma.approvalTask.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { case: true },
    });

    return approvalQueueResponseSchema.parse(
      tasks.map((task) => ({
        id: task.id,
        caseId: task.caseId,
        approverId: task.approverId,
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

  async markApproved(taskId: string, decisionReason?: string) {
    return this.prisma.approvalTask.update({
      where: { id: taskId },
      data: {
        status: "APPROVED",
        decision: "APPROVED",
        decisionReason,
      },
    });
  }

  async markRejected(taskId: string, decisionReason?: string) {
    return this.prisma.approvalTask.update({
      where: { id: taskId },
      data: {
        status: "REJECTED",
        decision: "REJECTED",
        decisionReason,
      },
    });
  }

  async requestInfo(taskId: string, decisionReason?: string) {
    return this.prisma.approvalTask.update({
      where: { id: taskId },
      data: {
        status: "INFO_REQUESTED",
        decision: "REQUEST_INFO",
        decisionReason,
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
}
