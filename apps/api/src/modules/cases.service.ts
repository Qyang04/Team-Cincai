import { Injectable } from "@nestjs/common";
import {
  caseListResponseSchema,
  type ArtifactProcessingSummary,
  type CaseListItem,
  type WorkflowType,
} from "@finance-ops/shared";
import type { AuthenticatedUser } from "./auth.types";
import { PrismaService } from "./prisma.service";

const manualActionStatuses = new Set([
  "AWAITING_REQUESTER_INFO",
  "AWAITING_APPROVAL",
  "AWAITING_APPROVER_INFO_RESPONSE",
  "FINANCE_REVIEW",
  "RECOVERABLE_EXCEPTION",
]);

function toIsoDateTimeString(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

function summarizeArtifacts(
  artifacts: Array<{ processingStatus: string; createdAt: Date | string }>,
): ArtifactProcessingSummary {
  const counts = {
    total: artifacts.length,
    prepared: 0,
    uploaded: 0,
    processing: 0,
    processed: 0,
    failed: 0,
  };

  for (const artifact of artifacts) {
    const key = artifact.processingStatus.toLowerCase();
    if (key in counts) {
      counts[key as keyof typeof counts] += 1;
    }
  }

  const latest = [...artifacts].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0];
  const latestStatus = latest?.processingStatus ?? null;
  const allProcessed = counts.total > 0 && counts.processed === counts.total;
  const hasFailures = counts.failed > 0;

  let summary = "No artifacts attached yet.";
  if (counts.total > 0) {
    if (hasFailures) {
      summary = `${counts.failed} artifact${counts.failed === 1 ? "" : "s"} failed processing.`;
    } else if (counts.processing > 0 || counts.uploaded > 0 || counts.prepared > 0) {
      const pending = counts.prepared + counts.uploaded + counts.processing;
      summary = `${pending} artifact${pending === 1 ? "" : "s"} still processing.`;
    } else if (allProcessed) {
      summary = `${counts.processed} artifact${counts.processed === 1 ? "" : "s"} processed successfully.`;
    }
  }

  return {
    ...counts,
    latestStatus,
    allProcessed,
    hasFailures,
    summary,
  };
}

function getRecommendedAction(status: string): string | null {
  switch (status) {
    case "DRAFT":
      return "submit_case";
    case "AWAITING_REQUESTER_INFO":
    case "AWAITING_APPROVER_INFO_RESPONSE":
      return "requester_response_required";
    case "AWAITING_APPROVAL":
      return "approval_decision_required";
    case "FINANCE_REVIEW":
      return "finance_review_decision_required";
    case "EXPORT_READY":
      return "run_export";
    case "RECOVERABLE_EXCEPTION":
      return "recover_case";
    default:
      return null;
  }
}

function getNeedsMyAction(
  user: AuthenticatedUser | undefined,
  input: {
    status: string;
    requesterId: string;
    approvalTasks: Array<{ approverId: string; status: string }>;
    financeReviews: Array<{ reviewerId: string | null; ownerId: string | null; outcome: string | null }>;
  },
) {
  if (!user) {
    return false;
  }

  if (
    user.roles.includes("REQUESTER") &&
    input.requesterId === user.id &&
    (input.status === "AWAITING_REQUESTER_INFO" || input.status === "AWAITING_APPROVER_INFO_RESPONSE")
  ) {
    return true;
  }

  if (
    user.roles.includes("APPROVER") &&
    input.status === "AWAITING_APPROVAL" &&
    input.approvalTasks.some((task) => task.approverId === user.id && task.status === "PENDING")
  ) {
    return true;
  }

  if (
    user.roles.includes("FINANCE_REVIEWER") &&
    input.status === "FINANCE_REVIEW" &&
    input.financeReviews.some(
      (review) =>
        review.outcome === null && (review.reviewerId === user.id || review.ownerId === user.id),
    )
  ) {
    return true;
  }

  return Boolean(user.roles.includes("ADMIN") && manualActionStatuses.has(input.status));
}

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCases(user?: AuthenticatedUser): Promise<CaseListItem[]> {
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
    const cases = await this.prisma.case.findMany({
      ...(where ? { where } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        artifacts: { orderBy: { createdAt: "asc" } },
        approvalTasks: {
          where: { status: { in: ["PENDING", "INFO_REQUESTED"] } },
          select: { approverId: true, status: true },
        },
        financeReviews: {
          where: { outcome: null },
          select: { reviewerId: true, ownerId: true, outcome: true },
        },
      },
    });

    return caseListResponseSchema.parse(
      cases.map((item) => ({
        id: item.id,
        workflowType: item.workflowType,
        status: item.status,
        stage: item.status,
        requesterId: item.requesterId,
        assignedTo: item.assignedTo,
        priority: item.priority as "LOW" | "MEDIUM" | "HIGH",
        createdAt: toIsoDateTimeString(item.createdAt),
        updatedAt: toIsoDateTimeString(item.updatedAt),
        manualActionRequired: manualActionStatuses.has(item.status),
        recommendedAction: getRecommendedAction(item.status),
        needsMyAction: getNeedsMyAction(user, {
          status: item.status,
          requesterId: item.requesterId,
          approvalTasks: item.approvalTasks,
          financeReviews: item.financeReviews,
        }),
        artifactSummary: summarizeArtifacts(item.artifacts),
        artifacts: item.artifacts.map((artifact) => ({
          id: artifact.id,
        })),
      })),
    );
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
        assignedTo: input.requesterId,
        status: "DRAFT",
        submittedNotes: null,
      },
    });
  }

  assignCaseOwner(caseId: string, assignedTo: string | null) {
    return this.prisma.case.update({
      where: { id: caseId },
      data: { assignedTo },
    });
  }

  getTransitions(caseId: string) {
    return this.prisma.workflowTransition.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
    });
  }
}
