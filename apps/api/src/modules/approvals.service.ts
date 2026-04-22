import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

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

  async listPendingTasks() {
    return this.prisma.approvalTask.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { case: true },
    });
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
