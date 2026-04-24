import test from "node:test";
import assert from "node:assert/strict";
import { CaseDetailService } from "./case-detail.service";

test("CaseDetailService returns additive summary fields alongside the existing nested arrays", async () => {
  const caseRecord = {
    id: "case-1",
    workflowType: "EXPENSE_CLAIM",
    status: "AWAITING_APPROVAL",
    requesterId: "demo.requester",
    assignedTo: null,
    priority: "MEDIUM",
    createdAt: "2026-04-22T09:00:00.000Z",
    updatedAt: "2026-04-22T10:00:00.000Z",
    artifacts: [],
    extractionResults: [{
      id: "extract-1",
      caseId: "case-1",
      fieldsJson: {},
      confidence: 0.82,
      provenance: {},
      createdAt: "2026-04-22T09:01:00.000Z",
    }],
    openQuestions: [{
      id: "question-1",
      caseId: "case-1",
      question: "Answered already",
      answer: "Yes",
      status: "ANSWERED",
      source: "AI_INTAKE",
      createdAt: "2026-04-22T09:01:30.000Z",
      updatedAt: "2026-04-22T09:02:00.000Z",
    }],
    policyResults: [{
      id: "policy-1",
      caseId: "case-1",
      passed: true,
      warnings: [],
      blockingIssues: [],
      requiresFinanceReview: false,
      duplicateSignals: [],
      reconciliationFlags: [],
      approvalRequirement: null,
      createdAt: "2026-04-22T09:02:00.000Z",
    }],
    approvalTasks: [{
      id: "task-1",
      caseId: "case-1",
      approverId: "manager.approver",
      status: "PENDING",
      decision: null,
      decisionReason: null,
      dueAt: "2026-04-23T09:00:00.000Z",
      createdAt: "2026-04-22T09:03:00.000Z",
      updatedAt: "2026-04-22T09:03:00.000Z",
    }],
    financeReviews: [{
      id: "review-1",
      caseId: "case-1",
      reviewerId: null,
      outcome: null,
      note: null,
      createdAt: "2026-04-22T09:04:00.000Z",
      updatedAt: "2026-04-22T09:04:00.000Z",
    }],
    exportRecords: [{
      id: "export-1",
      caseId: "case-1",
      status: "READY",
      connectorName: "mock-accounting-export",
      errorMessage: null,
      createdAt: "2026-04-22T09:05:00.000Z",
      updatedAt: "2026-04-22T09:05:00.000Z",
    }],
    workflowTransitions: [{
      id: "transition-1",
      caseId: "case-1",
      fromStatus: "POLICY_REVIEW",
      toStatus: "AWAITING_APPROVAL",
      actorType: "SYSTEM",
      actorId: null,
      note: "Ready for approval review.",
      createdAt: "2026-04-22T09:03:00.000Z",
    }],
    auditEvents: [
      {
        id: "audit-1",
        caseId: "case-1",
        eventType: "AI_INTAKE_ANALYZED",
        actorType: "SYSTEM",
        actorId: null,
        payload: {
          decision: {
            reasoningSummary: "Ready for approval review.",
            recommendedAction: "advance_to_policy_review",
          },
        },
        createdAt: "2026-04-22T09:02:30.000Z",
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
  assert.deepEqual(detail?.artifactSummary, {
    total: 0,
    prepared: 0,
    uploaded: 0,
    processing: 0,
    processed: 0,
    failed: 0,
    latestStatus: null,
    allProcessed: false,
    hasFailures: false,
    summary: "No artifacts attached yet.",
  });
  assert.equal(detail?.reasoningSummary, "Ready for approval review.");
  assert.equal(detail?.recommendedAction, "approval_decision_required");
  assert.equal(detail?.failureMode, null);
  assert.deepEqual(detail?.exportReadinessSummary, {
    ready: false,
    status: "BLOCKED",
    summary: "Approval decision is still required before export.",
  });
  assert.deepEqual(detail?.latestExtraction, caseRecord.extractionResults[0]);
  assert.deepEqual(detail?.latestPolicyResult, {
    ...caseRecord.policyResults[0],
    reconciliationFlags: undefined,
    approvalRequirement: undefined,
  });
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
        requesterId: "demo.requester",
        assignedTo: null,
        priority: "MEDIUM",
        createdAt: "2026-04-22T09:00:00.000Z",
        updatedAt: "2026-04-22T10:00:00.000Z",
        artifacts: [{
          id: "artifact-1",
          caseId: "case-2",
          type: "RECEIPT",
          filename: "receipt.jpg",
          mimeType: null,
          storageUri: null,
          extractedText: null,
          processingStatus: "PROCESSED",
          errorMessage: null,
          uploadedAt: "2026-04-22T09:00:30.000Z",
          processingStartedAt: "2026-04-22T09:00:31.000Z",
          processingCompletedAt: "2026-04-22T09:00:32.000Z",
          createdAt: "2026-04-22T09:00:00.000Z",
          updatedAt: "2026-04-22T09:00:32.000Z",
        }],
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
  assert.equal(detail?.artifactSummary.processed, 1);
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
        requesterId: "demo.requester",
        assignedTo: null,
        priority: "MEDIUM",
        createdAt: "2026-04-22T09:00:00.000Z",
        updatedAt: "2026-04-22T10:00:00.000Z",
        artifacts: [],
        extractionResults: [],
        openQuestions: [],
        policyResults: [],
        approvalTasks: [],
        financeReviews: [],
        exportRecords: [
          {
            id: "export-2",
            caseId: "case-3",
            status: "FAILED",
            connectorName: "mock-accounting-export",
            errorMessage: "Mock export connector failure triggered by artifact filename.",
            createdAt: "2026-04-22T09:05:00.000Z",
            updatedAt: "2026-04-22T09:05:00.000Z",
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
  assert.equal(detail?.artifactSummary.total, 0);
  assert.equal(detail?.recommendedAction, "recover_case");
  assert.equal(detail?.failureMode, "EXPORT_FAILURE");
  assert.deepEqual(detail?.exportReadinessSummary, {
    ready: false,
    status: "BLOCKED",
    summary: "Export failed and the case must be recovered before retrying.",
  });
});
