import test from "node:test";
import assert from "node:assert/strict";
import { CaseDetailService } from "./case-detail.service";

test("CaseDetailService returns additive summary fields alongside the existing nested arrays", async () => {
  const caseRecord = {
    id: "case-1",
    workflowType: "EXPENSE_CLAIM",
    status: "AWAITING_APPROVAL",
    artifacts: [],
    extractionResults: [{ id: "extract-1", confidence: 0.82 }],
    openQuestions: [{ id: "question-1", status: "ANSWERED" }],
    policyResults: [{ id: "policy-1", passed: true }],
    approvalTasks: [{ id: "task-1", status: "PENDING" }],
    financeReviews: [{ id: "review-1", outcome: null }],
    exportRecords: [{ id: "export-1", status: "READY" }],
    workflowTransitions: [{ id: "transition-1" }],
    auditEvents: [
      {
        id: "audit-1",
        eventType: "AI_INTAKE_ANALYZED",
        payload: {
          decision: {
            reasoningSummary: "Ready for approval review.",
            recommendedAction: "advance_to_policy_review",
          },
        },
      },
    ],
  };

  const prisma = {
    case: {
      findUnique: async () => caseRecord,
    },
  };

  const service = new CaseDetailService(prisma as never);
  const detail = await service.getCaseDetail("case-1");

  assert.equal(detail?.stage, "AWAITING_APPROVAL");
  assert.equal(detail?.manualActionRequired, true);
  assert.equal(detail?.reasoningSummary, "Ready for approval review.");
  assert.equal(detail?.recommendedAction, "approval_decision_required");
  assert.equal(detail?.failureMode, null);
  assert.deepEqual(detail?.exportReadinessSummary, {
    ready: false,
    status: "BLOCKED",
    summary: "Approval decision is still required before export.",
  });
  assert.deepEqual(detail?.latestExtraction, caseRecord.extractionResults[0]);
  assert.deepEqual(detail?.latestPolicyResult, caseRecord.policyResults[0]);
  assert.deepEqual(detail?.latestApprovalTask, caseRecord.approvalTasks[0]);
  assert.deepEqual(detail?.latestFinanceReview, caseRecord.financeReviews[0]);
  assert.deepEqual(detail?.latestExportRecord, caseRecord.exportRecords[0]);
  assert.deepEqual(detail?.approvalTasks, caseRecord.approvalTasks);
  assert.deepEqual(detail?.auditEvents, caseRecord.auditEvents);
});

test("CaseDetailService marks export-ready cases as not requiring manual action", async () => {
  const prisma = {
    case: {
      findUnique: async () => ({
        id: "case-2",
        workflowType: "EXPENSE_CLAIM",
        status: "EXPORT_READY",
        artifacts: [{ id: "artifact-1", processingStatus: "PROCESSED" }],
        extractionResults: [],
        openQuestions: [],
        policyResults: [],
        approvalTasks: [],
        financeReviews: [],
        exportRecords: [],
        workflowTransitions: [],
        auditEvents: [],
      }),
    },
  };

  const service = new CaseDetailService(prisma as never);
  const detail = await service.getCaseDetail("case-2");

  assert.equal(detail?.manualActionRequired, false);
  assert.equal(detail?.recommendedAction, "run_export");
  assert.equal(detail?.failureMode, null);
  assert.deepEqual(detail?.exportReadinessSummary, {
    ready: true,
    status: "READY",
    summary: "Case is ready for export.",
  });
  assert.equal(detail?.latestExportRecord, null);
});

test("CaseDetailService derives export failure mode and recovery guidance from recoverable exception cases", async () => {
  const prisma = {
    case: {
      findUnique: async () => ({
        id: "case-3",
        workflowType: "EXPENSE_CLAIM",
        status: "RECOVERABLE_EXCEPTION",
        artifacts: [],
        extractionResults: [],
        openQuestions: [],
        policyResults: [],
        approvalTasks: [],
        financeReviews: [],
        exportRecords: [
          {
            id: "export-2",
            status: "FAILED",
            errorMessage: "Mock export connector failure triggered by artifact filename.",
          },
        ],
        workflowTransitions: [],
        auditEvents: [],
      }),
    },
  };

  const service = new CaseDetailService(prisma as never);
  const detail = await service.getCaseDetail("case-3");

  assert.equal(detail?.manualActionRequired, true);
  assert.equal(detail?.recommendedAction, "recover_case");
  assert.equal(detail?.failureMode, "EXPORT_FAILURE");
  assert.deepEqual(detail?.exportReadinessSummary, {
    ready: false,
    status: "BLOCKED",
    summary: "Export failed and the case must be recovered before retrying.",
  });
});
