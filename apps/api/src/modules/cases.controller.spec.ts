import test from "node:test";
import assert from "node:assert/strict";
import { CasesController } from "./cases.controller";

function createCasesControllerHarness(options?: {
  caseRecord?: Record<string, unknown> | null;
  infoRequestedTask?: Record<string, unknown> | null;
  financeReviewRecord?: Record<string, unknown>;
  approvalTask?: Record<string, unknown> | null;
  exportProcessResult?: Record<string, unknown>;
}) {
  const workflowTransitions: Array<Record<string, unknown>> = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  const reopenedTasks: string[] = [];
  const runPolicyCalls: string[] = [];
  const recoverCalls: string[] = [];
  const createdQuestions: Array<Record<string, unknown>> = [];
  const resolvedReviews: Array<Record<string, unknown>> = [];

  const answeredQuestion = {
    id: "question-1",
    caseId: "case-1",
    question: "Please provide the project code.",
    answer: "OPS-12",
    status: "ANSWERED",
    source: "APPROVER_REQUEST",
  };

  const intakeService = {
    answerQuestion: async () => answeredQuestion,
    createQuestion: async (caseId: string, question: string, source: string) => {
      const createdQuestion = {
        id: `question-${createdQuestions.length + 1}`,
        caseId,
        question,
        source,
      };
      createdQuestions.push(createdQuestion);
      return createdQuestion;
    },
    listQuestions: async () => [],
  };

  const casesService = {
    getCase: async () =>
      options && "caseRecord" in options
        ? options.caseRecord
        : {
            id: "case-1",
            requesterId: "demo.requester",
            status: "AWAITING_APPROVER_INFO_RESPONSE",
            openQuestions: [
              {
                id: "question-1",
                status: "ANSWERED",
                source: "APPROVER_REQUEST",
              },
            ],
          },
    listCases: async () => [],
    createCase: async () => undefined,
    getTransitions: async () => [],
  };

  const approvalsService = {
    getLatestInfoRequestedTask: async () =>
      options && "infoRequestedTask" in options
        ? options.infoRequestedTask
        : {
            id: "task-1",
            caseId: "case-1",
            status: "INFO_REQUESTED",
          },
    reopenTask: async (taskId: string) => {
      reopenedTasks.push(taskId);
      return { id: taskId, status: "PENDING" };
    },
    listPendingTasks: async () => [],
    getTask: async () =>
      options && "approvalTask" in options
        ? options.approvalTask
        : null,
    markApproved: async () => undefined,
    markRejected: async () => undefined,
    requestInfo: async () => undefined,
  };

  const workflowService = {
    transitionCase: async (input: Record<string, unknown>) => {
      workflowTransitions.push(input);
      return { id: input.caseId, status: input.to };
    },
  };

  const auditService = {
    recordEvent: async (input: Record<string, unknown>) => {
      auditEvents.push(input);
      return input;
    },
    listForCase: async () => [],
  };

  const workflowOrchestrator = {
    runPolicyAndRoute: async (caseId: string) => {
      runPolicyCalls.push(caseId);
      return null;
    },
    recoverCase: async (caseId: string, actor: Record<string, unknown>) => {
      recoverCalls.push(caseId);
      return {
        case: {
          id: caseId,
          status: "AWAITING_APPROVAL",
        },
        policyResult: {
          passed: true,
          warnings: [],
          blockingIssues: [],
          requiresFinanceReview: false,
          duplicateSignals: [],
        },
        actor,
      };
    },
    submitDraftCase: async () => undefined,
    processArtifactUpload: async () => undefined,
    processExport: async () =>
      options?.exportProcessResult ?? {
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
  };

  const controller = new CasesController(
    casesService as never,
    workflowService as never,
    { listForCase: async () => [], attachMany: async () => [], getArtifact: async () => null } as never,
    auditService as never,
    intakeService as never,
    { getCaseDetail: async () => null } as never,
    { getLatestPolicyResult: async () => null } as never,
    approvalsService as never,
    {
      listOpenCases: async () => [],
      resolve: async (reviewId: string, reviewerId: string, outcome: string, note?: string) => {
        const review = options?.financeReviewRecord ?? {
          id: reviewId,
          caseId: "case-1",
          reviewerId,
          outcome,
          note,
        };
        resolvedReviews.push({
          reviewId,
          reviewerId,
          outcome,
          note,
        });
        return review;
      },
    } as never,
    { ensureExportReady: async () => undefined, getLatest: async () => undefined } as never,
    { prepareUpload: async () => undefined } as never,
    { saveUploadedFile: async () => ({ storageUri: "local://case-1/mock-stored" }) } as never,
    workflowOrchestrator as never,
  );

  return {
    controller,
    workflowTransitions,
    auditEvents,
    reopenedTasks,
    runPolicyCalls,
    recoverCalls,
    createdQuestions,
    resolvedReviews,
  };
}

test("CasesController reopens the latest info-requested approval task before returning the case to awaiting approval", async () => {
  const harness = createCasesControllerHarness();

  const answered = await harness.controller.answerQuestion("case-1", "question-1", {
    answer: "OPS-12",
  });

  assert.equal(answered.success, true);
  assert.equal(answered.data.question.status, "ANSWERED");
  assert.deepEqual(harness.reopenedTasks, ["task-1"]);
  assert.deepEqual(harness.workflowTransitions, [
    {
      caseId: "case-1",
      from: "AWAITING_APPROVER_INFO_RESPONSE",
      to: "AWAITING_APPROVAL",
      actorType: "REQUESTER",
      actorId: "demo.requester",
      note: "Requester answered approver follow-up questions.",
    },
  ]);
  assert.equal(harness.auditEvents.length, 1);
  assert.equal(harness.auditEvents[0]?.eventType, "QUESTION_ANSWERED");
  assert.deepEqual(harness.runPolicyCalls, []);
});

test("CasesController audits and fails loudly when requester follow-up completes but no approval task is waiting for re-entry", async () => {
  const harness = createCasesControllerHarness({ infoRequestedTask: null });

  await assert.rejects(
    harness.controller.answerQuestion("case-1", "question-1", {
      answer: "OPS-12",
    }),
    /Approval task awaiting requester response not found/,
  );

  assert.deepEqual(harness.reopenedTasks, []);
  assert.equal(harness.workflowTransitions.length, 0);
  assert.equal(harness.auditEvents.length, 2);
  assert.equal(harness.auditEvents[0]?.eventType, "QUESTION_ANSWERED");
  assert.equal(harness.auditEvents[1]?.eventType, "APPROVAL_REENTRY_FAILED");
});

test("CasesController reruns policy routing when requester answers the final finance-review clarification", async () => {
  const harness = createCasesControllerHarness({
    caseRecord: {
      id: "case-1",
      requesterId: "demo.requester",
      status: "AWAITING_REQUESTER_INFO",
      openQuestions: [
        {
          id: "question-1",
          status: "ANSWERED",
          source: "FINANCE_REVIEW",
        },
      ],
    },
  });

  const answered = await harness.controller.answerQuestion("case-1", "question-1", {
    answer: "Updated supporting note",
  });

  assert.equal(answered.success, true);
  assert.equal(answered.data.question.status, "ANSWERED");
  assert.deepEqual(harness.workflowTransitions, [
    {
      caseId: "case-1",
      from: "AWAITING_REQUESTER_INFO",
      to: "POLICY_REVIEW",
      actorType: "REQUESTER",
      actorId: "demo.requester",
      note: "Requester completed outstanding clarification questions.",
    },
  ]);
  assert.deepEqual(harness.runPolicyCalls, ["case-1"]);
  assert.deepEqual(harness.reopenedTasks, []);
});

test("CasesController send-back keeps finance review visible as a requester clarification loop", async () => {
  const harness = createCasesControllerHarness();

  const result = await harness.controller.sendBackFinanceReview(
    "review-1",
    { id: "configured.finance" } as never,
    { note: "Please attach the settled amount evidence." },
  );

  assert.equal(result.success, true);
  assert.equal(result.data.case.status, "AWAITING_REQUESTER_INFO");
  assert.equal(result.data.review.outcome, "SENT_BACK");
  assert.deepEqual(harness.resolvedReviews, [
    {
      reviewId: "review-1",
      reviewerId: "configured.finance",
      outcome: "SENT_BACK",
      note: "Please attach the settled amount evidence.",
    },
  ]);
  assert.deepEqual(harness.workflowTransitions, [
    {
      caseId: "case-1",
      from: "FINANCE_REVIEW",
      to: "AWAITING_REQUESTER_INFO",
      actorType: "FINANCE_REVIEWER",
      actorId: "configured.finance",
      note: "Please attach the settled amount evidence.",
    },
  ]);
  assert.deepEqual(harness.createdQuestions, [
    {
      id: "question-1",
      caseId: "case-1",
      question: "Please attach the settled amount evidence.",
      source: "FINANCE_REVIEW",
    },
  ]);
});

test("CasesController recovers a case from recoverable exception back into policy routing", async () => {
  const harness = createCasesControllerHarness();

  const result = await harness.controller.recoverCase("case-1", {
    id: "configured.finance",
    roles: ["FINANCE_REVIEWER"],
  } as never);

  assert.deepEqual(harness.recoverCalls, ["case-1"]);
  assert.deepEqual(result, {
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
});

test("CasesController wraps approval success in the shared action envelope", async () => {
  const harness = createCasesControllerHarness({
    approvalTask: {
      id: "task-1",
      caseId: "case-1",
    },
  });

  const result = await harness.controller.approveTask(
    "task-1",
    { id: "configured.approver" } as never,
    { decisionReason: "Approved" },
  );

  assert.deepEqual(result, {
    success: true,
    data: {
      case: {
        id: "case-1",
        status: "EXPORT_READY",
      },
      exportRecord: null,
    },
  });
});

test("CasesController wraps export orchestration errors in the shared error envelope", async () => {
  const harness = createCasesControllerHarness({
    exportProcessResult: {
      error: "Case is not ready for export",
    },
  });

  const result = await harness.controller.processExport("case-1");

  assert.deepEqual(result, {
    success: false,
    error: "Case is not ready for export",
  });
});
