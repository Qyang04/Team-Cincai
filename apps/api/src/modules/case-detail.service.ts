import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

const manualActionStatuses = new Set([
  "AWAITING_REQUESTER_INFO",
  "AWAITING_APPROVAL",
  "AWAITING_APPROVER_INFO_RESPONSE",
  "FINANCE_REVIEW",
  "RECOVERABLE_EXCEPTION",
]);

type AuditEventLike = {
  eventType?: string;
  payload?: Record<string, unknown> | null;
};

type PolicyResultLike = {
  blockingIssues?: unknown;
  duplicateSignals?: unknown;
};

type ExportRecordLike = {
  status?: string | null;
  errorMessage?: string | null;
};

type ArtifactLike = {
  processingStatus?: string | null;
};

function getLatestAiDecision(auditEvents: AuditEventLike[]) {
  for (const event of [...auditEvents].reverse()) {
    if (event.eventType !== "AI_INTAKE_ANALYZED") {
      continue;
    }

    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const decision = (payload.decision ?? {}) as Record<string, unknown>;
    const reasoningSummary =
      typeof decision.reasoningSummary === "string" ? decision.reasoningSummary : null;
    const recommendedAction =
      typeof decision.recommendedAction === "string" ? decision.recommendedAction : null;

    return {
      reasoningSummary,
      recommendedAction,
    };
  }

  return {
    reasoningSummary: null,
    recommendedAction: null,
  };
}

function getRecommendedAction(status: string, aiRecommendedAction: string | null) {
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
      return aiRecommendedAction;
  }
}

function getFailureMode(
  status: string,
  artifacts: ArtifactLike[],
  latestPolicyResult: PolicyResultLike | null,
  latestExportRecord: ExportRecordLike | null,
) {
  if (latestExportRecord?.errorMessage) {
    return "EXPORT_FAILURE";
  }

  if (artifacts.some((artifact) => artifact.processingStatus === "FAILED")) {
    return "ARTIFACT_PROCESSING_FAILURE";
  }

  const blockingIssues = Array.isArray(latestPolicyResult?.blockingIssues)
    ? latestPolicyResult?.blockingIssues
    : [];
  if (blockingIssues.length > 0) {
    return "POLICY_BLOCKED";
  }

  const duplicateSignals = Array.isArray(latestPolicyResult?.duplicateSignals)
    ? latestPolicyResult?.duplicateSignals
    : [];
  if (duplicateSignals.length > 0 && status === "FINANCE_REVIEW") {
    return "DUPLICATE_SIGNAL";
  }

  return null;
}

function getExportReadinessSummary(status: string, latestExportRecord: ExportRecordLike | null) {
  switch (status) {
    case "EXPORT_READY":
      return {
        ready: true,
        status: "READY",
        summary: "Case is ready for export.",
      };
    case "EXPORTING":
      return {
        ready: true,
        status: "IN_PROGRESS",
        summary: "Export is currently in progress.",
      };
    case "EXPORTED":
    case "CLOSED":
      return {
        ready: true,
        status: "DONE",
        summary: "Export completed successfully.",
      };
    case "AWAITING_APPROVAL":
      return {
        ready: false,
        status: "BLOCKED",
        summary: "Approval decision is still required before export.",
      };
    case "FINANCE_REVIEW":
      return {
        ready: false,
        status: "BLOCKED",
        summary: "Finance review must be completed before export.",
      };
    case "AWAITING_REQUESTER_INFO":
    case "AWAITING_APPROVER_INFO_RESPONSE":
      return {
        ready: false,
        status: "BLOCKED",
        summary: "Outstanding clarification is blocking export readiness.",
      };
    case "RECOVERABLE_EXCEPTION":
      return {
        ready: false,
        status: "BLOCKED",
        summary: latestExportRecord?.errorMessage
          ? "Export failed and the case must be recovered before retrying."
          : "The case must be recovered before it can move back toward export.",
      };
    case "REJECTED":
      return {
        ready: false,
        status: "BLOCKED",
        summary: "Rejected cases cannot be exported.",
      };
    default:
      return {
        ready: false,
        status: "BLOCKED",
        summary: "The case is not yet ready for export.",
      };
  }
}

@Injectable()
export class CaseDetailService {
  constructor(private readonly prisma: PrismaService) {}

  async getCaseDetail(caseId: string) {
    const caseDetail = await this.prisma.case.findUnique({
      where: { id: caseId },
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

    if (!caseDetail) {
      return null;
    }

    const latestExtraction = caseDetail.extractionResults[0] ?? null;
    const latestPolicyResult = caseDetail.policyResults[0] ?? null;
    const latestApprovalTask = caseDetail.approvalTasks[0] ?? null;
    const latestFinanceReview = caseDetail.financeReviews[0] ?? null;
    const latestExportRecord = caseDetail.exportRecords[0] ?? null;
    const latestAiDecision = getLatestAiDecision(caseDetail.auditEvents as AuditEventLike[]);
    const reasoningSummary = latestAiDecision.reasoningSummary;
    const recommendedAction = getRecommendedAction(
      caseDetail.status,
      latestAiDecision.recommendedAction,
    );
    const failureMode = getFailureMode(
      caseDetail.status,
      caseDetail.artifacts as ArtifactLike[],
      latestPolicyResult as PolicyResultLike | null,
      latestExportRecord as ExportRecordLike | null,
    );
    const exportReadinessSummary = getExportReadinessSummary(
      caseDetail.status,
      latestExportRecord as ExportRecordLike | null,
    );

    return {
      ...caseDetail,
      stage: caseDetail.status,
      manualActionRequired: manualActionStatuses.has(caseDetail.status),
      latestExtraction,
      latestPolicyResult,
      latestApprovalTask,
      latestFinanceReview,
      latestExportRecord,
      reasoningSummary,
      recommendedAction,
      failureMode,
      exportReadinessSummary,
    };
  }
}
