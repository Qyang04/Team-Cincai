import test from "node:test";
import assert from "node:assert/strict";
import { CasesController } from "./cases.controller";

function createCasesControllerHarness(options?: {
  caseRecord?: Record<string, unknown> | null;
  infoRequestedTask?: Record<string, unknown> | null;
  financeReviewRecord?: Record<string, unknown>;
}) {
  const workflowTransitions: Array<Record<string, unknown>> = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  const reopenedTasks: string[] = [];
  const runPolicyCalls: string[] = [];
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
    getTask: async () => null,
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
    submitDraftCase: async () => undefined,
    processArtifactUpload: async () => undefined,
    processExport: async () => undefined,
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
    workflowOrchestrator as never,
  );

  return {
    controller,
    workflowTransitions,
    auditEvents,
    reopenedTasks,
    runPolicyCalls,
    createdQuestions,
    resolvedReviews,
  };
}

test("CasesController reopens the latest info-requested approval task before returning the case to awaiting approval", async () => {
  const harness = createCasesControllerHarness();

  const answered = await harness.controller.answerQuestion("case-1", "question-1", {
    answer: "OPS-12",
  });

  assert.equal(answered.status, "ANSWERED");
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

  assert.equal(answered.status, "ANSWERED");
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

  assert.equal(result.case.status, "AWAITING_REQUESTER_INFO");
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
