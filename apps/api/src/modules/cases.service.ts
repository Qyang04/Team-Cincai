import { Injectable } from "@nestjs/common";
import type { WorkflowType } from "@finance-ops/shared";
import { PrismaService } from "./prisma.service";

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  listCases() {
    return this.prisma.case.findMany({
      orderBy: { createdAt: "desc" },
      include: { artifacts: true },
    });
  }

  getCase(id: string) {
    return this.prisma.case.findUnique({
      where: { id },
      include: {
        artifacts: { orderBy: { createdAt: "asc" } },
        extractionResults: { orderBy: { createdAt: "desc" }, take: 1 },
        openQuestions: { orderBy: { createdAt: "asc" } },
        policyResults: { orderBy: { createdAt: "desc" }, take: 1 },
        approvalTasks: { orderBy: { createdAt: "desc" } },
        financeReviews: { orderBy: { createdAt: "desc" } },
        exportRecords: { orderBy: { createdAt: "desc" }, take: 1 },
        workflowTransitions: { orderBy: { createdAt: "asc" } },
        auditEvents: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  createCase(input: { workflowType: WorkflowType; requesterId: string }) {
    return this.prisma.case.create({
      data: {
        workflowType: input.workflowType,
        requesterId: input.requesterId,
        status: "DRAFT",
        submittedNotes: null,
      },
    });
  }

  getTransitions(caseId: string) {
    return this.prisma.workflowTransition.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
    });
  }
}
