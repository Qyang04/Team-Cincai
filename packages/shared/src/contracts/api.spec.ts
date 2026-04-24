import test from "node:test";
import assert from "node:assert/strict";
import {
  adminConnectorsResponseSchema,
  adminPolicyConfigSchema,
  adminRoutingConfigSchema,
  approvalActionResponseSchema,
  approvalQueueItemSchema,
  caseListResponseSchema,
  caseDetailResponseSchema,
  exportActionResponseSchema,
  financeReviewActionResponseSchema,
  caseSubmissionResponseSchema,
  financeReviewQueueItemSchema,
  questionResponseActionResponseSchema,
  recoverActionResponseSchema,
} from "./api";

test("caseDetailResponseSchema accepts the current additive case-detail surface", () => {
  const parsed = caseDetailResponseSchema.parse({
    id: "case-1",
    workflowType: "EXPENSE_CLAIM",
    status: "AWAITING_APPROVAL",
    stage: "AWAITING_APPROVAL",
    priority: "MEDIUM",
    requesterId: "demo.requester",
    assignedTo: null,
    createdAt: "2026-04-22T09:00:00.000Z",
    updatedAt: "2026-04-22T10:00:00.000Z",
    manualActionRequired: true,
    artifactSummary: {
      total: 1,
      prepared: 0,
      uploaded: 0,
      processing: 0,
      processed: 1,
      failed: 0,
      latestStatus: "PROCESSED",
      allProcessed: true,
      hasFailures: false,
      summary: "1 artifact processed successfully.",
    },
    reasoningSummary: "Ready for approval review.",
    recommendedAction: "approval_decision_required",
    failureMode: null,
    latestExtraction: {
      id: "extract-1",
      caseId: "case-1",
      fieldsJson: {
        amount: 128.42,
        currency: "MYR",
        merchant: "Nasi Lemak Corner",
        projectCode: null,
      },
      confidence: 0.82,
      provenance: {
        amount: "ocr.receipt.total",
        merchant: "ocr.receipt.merchant",
      },
      modelMetadata: {
        provider: "mock-ai",
      },
      createdAt: "2026-04-22T09:01:00.000Z",
    },
    latestPolicyResult: {
      id: "policy-1",
      caseId: "case-1",
      passed: false,
      warnings: ["Amount exceeds standard manager-only threshold."],
      blockingIssues: ["Project code is required before approval."],
      requiresFinanceReview: true,
      duplicateSignals: [],
      reconciliationFlags: ["MISSING_PROJECT_CODE"],
      approvalRequirement: "FINANCE_REVIEW",
      createdAt: "2026-04-22T09:02:00.000Z",
    },
    latestApprovalTask: {
      id: "task-1",
      caseId: "case-1",
      approverId: "manager.approver",
      status: "PENDING",
      decision: null,
      decisionReason: null,
      dueAt: "2026-04-23T09:00:00.000Z",
      createdAt: "2026-04-22T09:03:00.000Z",
      updatedAt: "2026-04-22T09:03:00.000Z",
    },
    latestFinanceReview: null,
    latestExportRecord: null,
    exportReadinessSummary: {
      ready: false,
      status: "BLOCKED",
      summary: "Approval decision is still required before export.",
    },
    artifacts: [
      {
        id: "artifact-1",
        caseId: "case-1",
        type: "RECEIPT",
        source: "UPLOAD",
        filename: "receipt.jpg",
        storageUri: "mock://artifacts/case-1/receipt.jpg",
        extractedText: "Lunch with client",
        checksum: "sha256-demo",
        metadata: {
          extractionMethod: "OCR_IMAGE",
          extractionWarnings: [],
        },
        processingStatus: "PROCESSED",
        errorMessage: null,
        uploadedAt: "2026-04-22T09:00:30.000Z",
        processingStartedAt: "2026-04-22T09:00:31.000Z",
        processingCompletedAt: "2026-04-22T09:00:32.000Z",
        createdAt: "2026-04-22T09:00:00.000Z",
        updatedAt: "2026-04-22T09:00:32.000Z",
      },
    ],
    extractionResults: [],
    openQuestions: [
      {
        id: "question-1",
        caseId: "case-1",
        question: "Please add the project code for this meal.",
        answer: null,
        status: "OPEN",
        source: "AI_INTAKE",
        createdAt: "2026-04-22T09:01:30.000Z",
        updatedAt: "2026-04-22T09:01:30.000Z",
      },
    ],
    policyResults: [],
    approvalTasks: [],
    financeReviews: [],
    exportRecords: [],
    workflowTransitions: [
      {
        id: "transition-1",
        caseId: "case-1",
        fromStatus: "POLICY_REVIEW",
        toStatus: "AWAITING_APPROVAL",
        actorType: "SYSTEM",
        actorId: null,
        note: "Ready for approval review.",
        createdAt: "2026-04-22T09:03:00.000Z",
      },
    ],
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
  });

  assert.equal(parsed.latestPolicyResult?.requiresFinanceReview, true);
  assert.equal(parsed.exportReadinessSummary.status, "BLOCKED");
});

test("approvalQueueItemSchema accepts operator-ready approval queue rows", () => {
  const parsed = approvalQueueItemSchema.parse({
    id: "task-1",
    caseId: "case-1",
    approverId: "manager.approver",
    status: "PENDING",
    decision: null,
    decisionReason: null,
    dueAt: "2026-04-23T09:00:00.000Z",
    createdAt: "2026-04-22T09:03:00.000Z",
    updatedAt: "2026-04-22T09:03:00.000Z",
    case: {
      id: "case-1",
      workflowType: "EXPENSE_CLAIM",
      status: "AWAITING_APPROVAL",
      priority: "MEDIUM",
      requesterId: "demo.requester",
      createdAt: "2026-04-22T09:00:00.000Z",
      updatedAt: "2026-04-22T10:00:00.000Z",
    },
  });

  assert.equal(parsed.case.status, "AWAITING_APPROVAL");
});

test("caseListResponseSchema accepts additive case-list rows with artifact metadata", () => {
  const parsed = caseListResponseSchema.parse([
    {
      id: "case-1",
      workflowType: "EXPENSE_CLAIM",
      status: "AWAITING_APPROVAL",
      priority: "MEDIUM",
      requesterId: "demo.requester",
      assignedTo: null,
      createdAt: "2026-04-22T09:00:00.000Z",
      updatedAt: "2026-04-22T10:00:00.000Z",
      stage: "AWAITING_APPROVAL",
      manualActionRequired: true,
      recommendedAction: "approval_decision_required",
      needsMyAction: false,
      artifactSummary: {
        total: 1,
        prepared: 0,
        uploaded: 0,
        processing: 0,
        processed: 1,
        failed: 0,
        latestStatus: "PROCESSED",
        allProcessed: true,
        hasFailures: false,
        summary: "1 artifact processed successfully.",
      },
      artifacts: [
        {
          id: "artifact-1",
          caseId: "case-1",
          type: "RECEIPT",
          source: "UPLOAD",
          filename: "receipt.jpg",
          storageUri: "mock://artifacts/case-1/receipt.jpg",
          extractedText: "Lunch with client",
          checksum: "sha256-demo",
          metadata: {
            extractionMethod: "OCR_IMAGE",
            extractionWarnings: [],
          },
          processingStatus: "PROCESSED",
          errorMessage: null,
          uploadedAt: "2026-04-22T09:00:30.000Z",
          processingStartedAt: "2026-04-22T09:00:31.000Z",
          processingCompletedAt: "2026-04-22T09:00:32.000Z",
          createdAt: "2026-04-22T09:00:00.000Z",
          updatedAt: "2026-04-22T09:00:32.000Z",
        },
      ],
    },
  ]);

  assert.equal(parsed[0]?.artifacts?.[0]?.id, "artifact-1");
  assert.equal(parsed[0]?.workflowType, "EXPENSE_CLAIM");
});

test("caseListResponseSchema rejects non-array payloads so UI loaders can fall back safely", () => {
  assert.throws(() =>
    caseListResponseSchema.parse({
      cases: [],
    }),
  );
});

test("financeReviewQueueItemSchema accepts operator-ready finance-review queue rows", () => {
  const parsed = financeReviewQueueItemSchema.parse({
    id: "review-1",
    caseId: "case-9",
    note: "Threshold exceeded.",
    outcome: null,
    reviewerId: null,
    createdAt: "2026-04-22T09:00:00.000Z",
    updatedAt: "2026-04-22T09:00:00.000Z",
    case: {
      id: "case-9",
      workflowType: "EXPENSE_CLAIM",
      status: "FINANCE_REVIEW",
      priority: "HIGH",
      requesterId: "demo.requester",
      createdAt: "2026-04-22T08:59:00.000Z",
      updatedAt: "2026-04-22T09:00:00.000Z",
    },
  });

  assert.equal(parsed.case.priority, "HIGH");
});

test("caseSubmissionResponseSchema accepts the current submit-draft response", () => {
  const parsed = caseSubmissionResponseSchema.parse({
    case: {
      id: "case-1",
      workflowType: "EXPENSE_CLAIM",
      status: "AWAITING_REQUESTER_INFO",
      requesterId: "demo.requester",
      assignedTo: null,
      priority: "MEDIUM",
      createdAt: "2026-04-22T09:00:00.000Z",
      updatedAt: "2026-04-22T09:02:00.000Z",
      stage: "AWAITING_REQUESTER_INFO",
      manualActionRequired: true,
      recommendedAction: "requester_response_required",
      needsMyAction: true,
      artifactSummary: {
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
      },
    },
    aiResult: {
      extraction: {
        fields: {
          amount: 128.42,
          currency: "MYR",
          merchant: "Nasi Lemak Corner",
        },
        confidence: 0.82,
        provenance: {
          amount: "ocr.receipt.total",
        },
        openQuestions: ["Please add the project code for this meal."],
        modelMetadata: {
          provider: "mock-ai",
        },
      },
      decision: {
        recommendedAction: "ask_requester_for_project_code",
        reasoningSummary: "Project code is missing, so clarification is required before policy review.",
        nextState: "AWAITING_REQUESTER_INFO",
        requiredApproverRole: "APPROVER",
      },
    },
    policyResult: null,
  });

  assert.equal(parsed.aiResult.decision.nextState, "AWAITING_REQUESTER_INFO");
});

test("admin config schemas accept the current policy, routing, and connector payloads", () => {
  const policy = adminPolicyConfigSchema.parse({
    managerApprovalThreshold: 500,
    requireProjectCodeWorkflows: ["EXPENSE_CLAIM", "INTERNAL_PAYMENT_REQUEST"],
    duplicateFilenameDetection: true,
    duplicateEvidenceDetection: true,
    invoiceNumberRequiredForVendorInvoices: true,
  });
  const routing = adminRoutingConfigSchema.parse({
    defaultApproverId: "manager.approver",
    financeReviewerId: "finance.reviewer",
    escalationWindowHours: 24,
  });
  const connectors = adminConnectorsResponseSchema.parse([
    {
      connector: "Auth",
      status: "mock-enabled",
      detail: "Mock headers drive user identity and role selection.",
    },
  ]);

  assert.equal(policy.requireProjectCodeWorkflows[0], "EXPENSE_CLAIM");
  assert.equal(routing.financeReviewerId, "finance.reviewer");
  assert.equal(connectors[0].connector, "Auth");
});

test("adminPolicyConfigSchema normalizes legacy lowercase workflow identifiers", () => {
  const policy = adminPolicyConfigSchema.parse({
    managerApprovalThreshold: 500,
    requireProjectCodeWorkflows: ["expense_claim", "internal_payment_request"],
    duplicateFilenameDetection: true,
    duplicateEvidenceDetection: true,
    invoiceNumberRequiredForVendorInvoices: true,
  });

  assert.deepEqual(policy.requireProjectCodeWorkflows, [
    "EXPENSE_CLAIM",
    "INTERNAL_PAYMENT_REQUEST",
  ]);
});

test("action response schemas accept the current success envelopes", () => {
  const questionResponse = questionResponseActionResponseSchema.parse({
    success: true,
    data: {
      question: {
        id: "question-1",
        caseId: "case-1",
        question: "Please provide the project code.",
        answer: "OPS-12",
        status: "ANSWERED",
        source: "APPROVER_REQUEST",
      },
    },
  });
  const approvalResponse = approvalActionResponseSchema.parse({
    success: true,
    data: {
      case: {
        id: "case-1",
        status: "EXPORT_READY",
      },
      exportRecord: {
        id: "export-1",
        caseId: "case-1",
        status: "READY",
        connectorName: "mock-accounting-export",
        errorMessage: null,
      },
    },
  });
  const financeReviewResponse = financeReviewActionResponseSchema.parse({
    success: true,
    data: {
      review: {
        id: "review-1",
        caseId: "case-1",
        reviewerId: "finance.reviewer",
        outcome: "APPROVED",
        note: "Looks good.",
      },
      case: {
        id: "case-1",
        status: "EXPORT_READY",
      },
      exportRecord: {
        id: "export-1",
        caseId: "case-1",
        status: "READY",
        connectorName: "mock-accounting-export",
        errorMessage: null,
      },
    },
  });
  const exportResponse = exportActionResponseSchema.parse({
    success: true,
    data: {
      case: {
        id: "case-1",
        status: "CLOSED",
      },
      exportRecord: {
        id: "export-1",
        caseId: "case-1",
        status: "EXPORTED",
        connectorName: "mock-accounting-export",
        errorMessage: null,
      },
    },
  });
  const recoverResponse = recoverActionResponseSchema.parse({
    success: true,
    data: {
      case: {
        id: "case-1",
        status: "AWAITING_APPROVAL",
      },
      policyResult: {
        passed: true,
        warnings: [],
        blockingIssues: [],
        requiresFinanceReview: false,
        duplicateSignals: [],
      },
    },
  });

  assert.equal(questionResponse.success, true);
  assert.equal(approvalResponse.success, true);
  assert.equal(financeReviewResponse.success, true);
  assert.equal(exportResponse.success, true);
  assert.equal(recoverResponse.success, true);
});

test("action response schemas accept the shared error envelope", () => {
  const parsed = approvalActionResponseSchema.parse({
    success: false,
    error: "Approval task not found",
  });

  assert.equal(parsed.success, false);
  assert.equal(parsed.error, "Approval task not found");
});
