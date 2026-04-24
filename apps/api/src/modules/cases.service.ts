import { Injectable } from "@nestjs/common";
import type { WorkflowType } from "@finance-ops/shared";
import type { AuthenticatedUser } from "./auth.types";
import { PrismaService } from "./prisma.service";

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  listCases(user?: AuthenticatedUser) {
    const where =
      !user || user.roles.includes("ADMIN")
        ? undefined
        : {
            OR: [
              ...(user.roles.includes("REQUESTER") ? [{ requesterId: user.id }] : []),
              ...(user.roles.includes("APPROVER") ? [{ approvalTasks: { some: { approverId: user.id } } }] : []),
              ...(user.roles.includes("FINANCE_REVIEWER")
                ? [{ financeReviews: { some: { OR: [{ reviewerId: user.id }, { ownerId: user.id }] } } }]
                : []),
            ],
          };
    return this.prisma.case.findMany({
      ...(where ? { where } : {}),
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
