import { Injectable } from "@nestjs/common";
import {
  caseDetailResponseSchema,
  type ArtifactProcessingSummary,
  type CaseDetailResponse,
} from "@finance-ops/shared";
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
  createdAt?: Date | string;
};

function toIsoDateTimeString(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

function toNullableIsoDateTimeString(value: Date | string | null | undefined) {
  if (value === null || value === undefined) {
    return value;
  }
  return toIsoDateTimeString(value);
}

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

function summarizeArtifacts(artifacts: ArtifactLike[]): ArtifactProcessingSummary {
  const counts = {
    total: artifacts.length,
    prepared: 0,
    uploaded: 0,
    processing: 0,
    processed: 0,
    failed: 0,
  };

  for (const artifact of artifacts) {
    const key = artifact.processingStatus?.toLowerCase();
    if (key && key in counts) {
      counts[key as keyof typeof counts] += 1;
    }
  }

  const latest = [...artifacts].sort(
    (left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime(),
  )[0];
  const latestStatus = latest?.processingStatus ?? null;
  const allProcessed = counts.total > 0 && counts.processed === counts.total;
  const hasFailures = counts.failed > 0;

  let summary = "No artifacts attached yet.";
  if (counts.total > 0) {
    if (hasFailures) {
      summary = `${counts.failed} artifact${counts.failed === 1 ? "" : "s"} failed processing.`;
    } else if (counts.prepared + counts.uploaded + counts.processing > 0) {
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

@Injectable()
export class CaseDetailService {
  constructor(private readonly prisma: PrismaService) {}

  async getCaseDetail(caseId: string): Promise<CaseDetailResponse | null> {
    const caseDetail = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        artifacts: { orderBy: { createdAt: "asc" } },
        extractionResults: { orderBy: { createdAt: "desc" }, take: 1 },
        openQuestions: { orderBy: { createdAt: "asc" } },
        policyResults: { orderBy: { createdAt: "desc" }, take: 1 },
        approvalTasks: { orderBy: { createdAt: "desc" }, include: { stage: true } },
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
    const artifactSummary = summarizeArtifacts(caseDetail.artifacts as ArtifactLike[]);

    return caseDetailResponseSchema.parse({
      id: caseDetail.id,
      workflowType: caseDetail.workflowType,
      status: caseDetail.status,
      requesterId: caseDetail.requesterId,
      assignedTo: caseDetail.assignedTo,
      priority: caseDetail.priority,
      createdAt: toIsoDateTimeString(caseDetail.createdAt),
      updatedAt: toIsoDateTimeString(caseDetail.updatedAt),
      stage: caseDetail.status,
      manualActionRequired: manualActionStatuses.has(caseDetail.status),
      artifactSummary,
      latestExtraction: latestExtraction
        ? {
            id: latestExtraction.id,
            caseId: latestExtraction.caseId,
            fieldsJson: latestExtraction.fieldsJson as Record<string, string | number | boolean | null>,
            confidence: latestExtraction.confidence,
            provenance: (latestExtraction.provenance as Record<string, string> | null | undefined) ?? null,
            createdAt: toIsoDateTimeString(latestExtraction.createdAt),
          }
        : null,
      latestPolicyResult: latestPolicyResult
        ? {
            id: latestPolicyResult.id,
            caseId: latestPolicyResult.caseId,
            passed: latestPolicyResult.passed,
            warnings: latestPolicyResult.warnings,
            blockingIssues: latestPolicyResult.blockingIssues,
            requiresFinanceReview: latestPolicyResult.requiresFinanceReview,
            duplicateSignals: latestPolicyResult.duplicateSignals,
            reconciliationFlags: undefined,
            approvalRequirement: undefined,
            createdAt: toIsoDateTimeString(latestPolicyResult.createdAt),
          }
        : null,
      latestApprovalTask: latestApprovalTask
        ? {
            id: latestApprovalTask.id,
            caseId: latestApprovalTask.caseId,
            approverId: latestApprovalTask.approverId,
            ...(latestApprovalTask.stageNumber !== undefined ? { stageNumber: latestApprovalTask.stageNumber } : {}),
            ...(latestApprovalTask.stageMode ? { stageMode: latestApprovalTask.stageMode } : {}),
            ...(latestApprovalTask.stageLabel ? { stageLabel: latestApprovalTask.stageLabel } : {}),
            ...(latestApprovalTask.stage?.dependencyType
              ? { stageDependencyType: latestApprovalTask.stage.dependencyType }
              : {}),
            ...(latestApprovalTask.stage?.requiredApprovals !== undefined
              ? { stageRequiredApprovals: latestApprovalTask.stage.requiredApprovals }
              : {}),
            ...(latestApprovalTask.stage?.slaHours !== undefined
              ? { stageSlaHours: latestApprovalTask.stage.slaHours }
              : {}),
            ...(latestApprovalTask.stage?.dueAt !== undefined
              ? { stageDueAt: toNullableIsoDateTimeString(latestApprovalTask.stage.dueAt) }
              : {}),
            ...(latestApprovalTask.stage?.escalatesTo !== undefined
              ? { stageEscalatesTo: latestApprovalTask.stage.escalatesTo }
              : {}),
            ...(latestApprovalTask.stage?.escalatedAt !== undefined
              ? { stageEscalatedAt: toNullableIsoDateTimeString(latestApprovalTask.stage.escalatedAt) }
              : {}),
            ...(latestApprovalTask.delegatedFrom ? { delegatedFrom: latestApprovalTask.delegatedFrom } : {}),
            ...(latestApprovalTask.actingApproverId ? { actingApproverId: latestApprovalTask.actingApproverId } : {}),
            status: latestApprovalTask.status,
            decision: latestApprovalTask.decision,
            decisionReason: latestApprovalTask.decisionReason,
            dueAt: toNullableIsoDateTimeString(latestApprovalTask.dueAt),
            createdAt: toIsoDateTimeString(latestApprovalTask.createdAt),
            updatedAt: toIsoDateTimeString(latestApprovalTask.updatedAt),
          }
        : null,
      latestFinanceReview: latestFinanceReview
        ? {
            id: latestFinanceReview.id,
            caseId: latestFinanceReview.caseId,
            reviewerId: latestFinanceReview.reviewerId,
            ...(latestFinanceReview.ownerId ? { ownerId: latestFinanceReview.ownerId } : {}),
            outcome: latestFinanceReview.outcome,
            ...(latestFinanceReview.reasonCategory ? { reasonCategory: latestFinanceReview.reasonCategory } : {}),
            ...(latestFinanceReview.codingDecision ? { codingDecision: latestFinanceReview.codingDecision } : {}),
            ...(latestFinanceReview.reconciliationStatus
              ? { reconciliationStatus: latestFinanceReview.reconciliationStatus }
              : {}),
            ...(latestFinanceReview.reconciledAmount !== null && latestFinanceReview.reconciledAmount !== undefined
              ? { reconciledAmount: latestFinanceReview.reconciledAmount }
              : {}),
            ...(latestFinanceReview.reconciledCurrency
              ? { reconciledCurrency: latestFinanceReview.reconciledCurrency }
              : {}),
            ...(latestFinanceReview.annotation ? { annotation: latestFinanceReview.annotation } : {}),
            note: latestFinanceReview.note,
            createdAt: toIsoDateTimeString(latestFinanceReview.createdAt),
            updatedAt: toIsoDateTimeString(latestFinanceReview.updatedAt),
          }
        : null,
      latestExportRecord: latestExportRecord
        ? {
            id: latestExportRecord.id,
            caseId: latestExportRecord.caseId,
            status: latestExportRecord.status,
            connectorName: latestExportRecord.connectorName,
            errorMessage: latestExportRecord.errorMessage,
            createdAt: toIsoDateTimeString(latestExportRecord.createdAt),
            updatedAt: toIsoDateTimeString(latestExportRecord.updatedAt),
          }
        : null,
      reasoningSummary,
      recommendedAction,
      failureMode,
      exportReadinessSummary,
      artifacts: caseDetail.artifacts.map((artifact) => ({
        id: artifact.id,
        caseId: artifact.caseId,
        type: artifact.type,
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        storageUri: artifact.storageUri,
        extractedText: artifact.extractedText,
        processingStatus: artifact.processingStatus,
        errorMessage: artifact.errorMessage,
        uploadedAt: toNullableIsoDateTimeString(artifact.uploadedAt),
        processingStartedAt: toNullableIsoDateTimeString(artifact.processingStartedAt),
        processingCompletedAt: toNullableIsoDateTimeString(artifact.processingCompletedAt),
        createdAt: toIsoDateTimeString(artifact.createdAt),
        updatedAt: toIsoDateTimeString(artifact.updatedAt),
      })),
      extractionResults: caseDetail.extractionResults.map((result) => ({
        id: result.id,
        caseId: result.caseId,
        fieldsJson: result.fieldsJson as Record<string, string | number | boolean | null>,
        confidence: result.confidence,
        provenance: (result.provenance as Record<string, string> | null | undefined) ?? null,
        createdAt: toIsoDateTimeString(result.createdAt),
      })),
      openQuestions: caseDetail.openQuestions.map((question) => ({
        id: question.id,
        caseId: question.caseId,
        question: question.question,
        answer: question.answer,
        status: question.status,
        source: question.source,
        createdAt: toIsoDateTimeString(question.createdAt),
        updatedAt: toIsoDateTimeString(question.updatedAt),
      })),
      policyResults: caseDetail.policyResults.map((result) => ({
        id: result.id,
        caseId: result.caseId,
        passed: result.passed,
        warnings: result.warnings,
        blockingIssues: result.blockingIssues,
        requiresFinanceReview: result.requiresFinanceReview,
        duplicateSignals: result.duplicateSignals,
        reconciliationFlags: undefined,
        approvalRequirement: undefined,
        createdAt: toIsoDateTimeString(result.createdAt),
      })),
      approvalTasks: caseDetail.approvalTasks.map((task) => ({
        id: task.id,
        caseId: task.caseId,
        approverId: task.approverId,
        ...(task.stageNumber !== undefined ? { stageNumber: task.stageNumber } : {}),
        ...(task.stageMode ? { stageMode: task.stageMode } : {}),
        ...(task.stageLabel ? { stageLabel: task.stageLabel } : {}),
        ...(task.stage?.dependencyType ? { stageDependencyType: task.stage.dependencyType } : {}),
        ...(task.stage?.requiredApprovals !== undefined ? { stageRequiredApprovals: task.stage.requiredApprovals } : {}),
        ...(task.stage?.slaHours !== undefined ? { stageSlaHours: task.stage.slaHours } : {}),
        ...(task.stage?.dueAt !== undefined ? { stageDueAt: toNullableIsoDateTimeString(task.stage.dueAt) } : {}),
        ...(task.stage?.escalatesTo !== undefined ? { stageEscalatesTo: task.stage.escalatesTo } : {}),
        ...(task.stage?.escalatedAt !== undefined
          ? { stageEscalatedAt: toNullableIsoDateTimeString(task.stage.escalatedAt) }
          : {}),
        ...(task.delegatedFrom ? { delegatedFrom: task.delegatedFrom } : {}),
        ...(task.actingApproverId ? { actingApproverId: task.actingApproverId } : {}),
        status: task.status,
        decision: task.decision,
        decisionReason: task.decisionReason,
        dueAt: toNullableIsoDateTimeString(task.dueAt),
        createdAt: toIsoDateTimeString(task.createdAt),
        updatedAt: toIsoDateTimeString(task.updatedAt),
      })),
      financeReviews: caseDetail.financeReviews.map((review) => ({
        id: review.id,
        caseId: review.caseId,
        reviewerId: review.reviewerId,
        ...(review.ownerId ? { ownerId: review.ownerId } : {}),
        outcome: review.outcome,
        ...(review.reasonCategory ? { reasonCategory: review.reasonCategory } : {}),
        ...(review.codingDecision ? { codingDecision: review.codingDecision } : {}),
        ...(review.reconciliationStatus ? { reconciliationStatus: review.reconciliationStatus } : {}),
        ...(review.reconciledAmount !== null && review.reconciledAmount !== undefined
          ? { reconciledAmount: review.reconciledAmount }
          : {}),
        ...(review.reconciledCurrency ? { reconciledCurrency: review.reconciledCurrency } : {}),
        ...(review.annotation ? { annotation: review.annotation } : {}),
        note: review.note,
        createdAt: toIsoDateTimeString(review.createdAt),
        updatedAt: toIsoDateTimeString(review.updatedAt),
      })),
      exportRecords: caseDetail.exportRecords.map((record) => ({
        id: record.id,
        caseId: record.caseId,
        status: record.status,
        connectorName: record.connectorName,
        errorMessage: record.errorMessage,
        createdAt: toIsoDateTimeString(record.createdAt),
        updatedAt: toIsoDateTimeString(record.updatedAt),
      })),
      workflowTransitions: caseDetail.workflowTransitions.map((transition) => ({
        id: transition.id,
        caseId: transition.caseId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        actorType: transition.actorType,
        actorId: transition.actorId,
        note: transition.note,
        createdAt: toIsoDateTimeString(transition.createdAt),
      })),
      auditEvents: caseDetail.auditEvents.map((event) => ({
        id: event.id,
        caseId: event.caseId,
        eventType: event.eventType,
        actorType: event.actorType,
        actorId: event.actorId,
        payload: event.payload as Record<string, unknown>,
        createdAt: toIsoDateTimeString(event.createdAt),
      })),
    });
  }
}
