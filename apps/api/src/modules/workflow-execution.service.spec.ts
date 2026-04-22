import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowExecutionService } from "./workflow-execution.service";

function createWorkflowExecutionHarness(options?: {
  caseStatus?: string;
  policyResult?: {
    passed: boolean;
    warnings: string[];
    blockingIssues: string[];
    requiresFinanceReview: boolean;
    duplicateSignals: string[];
  };
  routingConfig?: {
    defaultApproverId: string;
    financeReviewerId: string;
    escalationWindowHours: number;
  };
  exportStatus?: "FAILED" | "EXPORTED";
}) {
  const transitions: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const createdTasks: Array<Record<string, unknown>> = [];
  const enqueuedReviews: Array<Record<string, unknown>> = [];
  const auditEvents: Array<Record<string, unknown>> = [];

  const casesService = {
    getCase: async () => ({
      id: "case-1",
      status: options?.caseStatus ?? "POLICY_REVIEW",
    }),
  };

  const policyService = {
    evaluateCase: async () =>
      options?.policyResult ?? {
        passed: true,
        warnings: [],
        blockingIssues: [],
        requiresFinanceReview: false,
        duplicateSignals: [],
      },
  };

  const approvalsService = {
    createTask: async (caseId: string, approverId: string) => {
      createdTasks.push({ caseId, approverId });
      return { id: "task-1", caseId, approverId };
    },
  };

  const financeReviewService = {
    enqueue: async (caseId: string, note?: string) => {
      enqueuedReviews.push({ caseId, note });
      return { id: "review-1", caseId, note };
    },
  };

  const workflowService = {
    transitionCase: async (input: Record<string, unknown>) => {
      transitions.push(input);
      return { id: input.caseId, status: input.to };
    },
  };

  const auditService = {
    recordEvent: async (input: Record<string, unknown>) => {
      auditEvents.push(input);
      return input;
    },
  };

  const notificationsService = {
    send: async (payload: Record<string, unknown>) => {
      notifications.push(payload);
      return payload;
    },
  };

  const exportsService = {
    process: async () => ({
      id: "export-1",
      status: options?.exportStatus ?? "EXPORTED",
      errorMessage: options?.exportStatus === "FAILED" ? "Connector failed." : null,
    }),
  };

  const adminConfigService = {
    getRoutingConfig: async () =>
      options?.routingConfig ?? {
        defaultApproverId: "configured.approver",
        financeReviewerId: "configured.finance",
        escalationWindowHours: 24,
      },
  };

  const service = new WorkflowExecutionService(
    { processArtifact: async () => undefined } as never,
    { analyzeIntake: async () => undefined } as never,
    policyService as never,
    approvalsService as never,
    financeReviewService as never,
    workflowService as never,
    auditService as never,
    exportsService as never,
    casesService as never,
    notificationsService as never,
    { increment: () => undefined, mark: () => undefined } as never,
    { registerHandler: () => undefined } as never,
    adminConfigService as never,
  );

  return {
    service,
    transitions,
    notifications,
    createdTasks,
    enqueuedReviews,
    auditEvents,
  };
}

test("WorkflowExecutionService routes policy-passing cases to the configured approver", async () => {
  const harness = createWorkflowExecutionHarness();

  const result = await harness.service.handlePolicyRoute({ caseId: "case-1" });
  const routedCase = result && "case" in result ? result.case : undefined;

  assert.equal(routedCase?.status, "AWAITING_APPROVAL");
  assert.deepEqual(harness.createdTasks, [
    {
      caseId: "case-1",
      approverId: "configured.approver",
    },
  ]);
  assert.equal(harness.notifications[0]?.recipientId, "configured.approver");
});

test("WorkflowExecutionService routes escalated cases to the configured finance reviewer", async () => {
  const harness = createWorkflowExecutionHarness({
    policyResult: {
      passed: false,
      warnings: ["Threshold exceeded."],
      blockingIssues: ["Project code missing."],
      requiresFinanceReview: true,
      duplicateSignals: [],
    },
  });

  const result = await harness.service.handlePolicyRoute({ caseId: "case-1" });
  const routedCase = result && "case" in result ? result.case : undefined;

  assert.equal(routedCase?.status, "FINANCE_REVIEW");
  assert.deepEqual(harness.enqueuedReviews, [
    {
      caseId: "case-1",
      note: "Project code missing.",
    },
  ]);
  assert.equal(harness.notifications[0]?.recipientId, "configured.finance");
});

test("WorkflowExecutionService moves failed exports into a recoverable exception path", async () => {
  const harness = createWorkflowExecutionHarness({
    caseStatus: "EXPORT_READY",
    exportStatus: "FAILED",
  });

  const result = await harness.service.handleExport({ caseId: "case-1" });
  const routedCase = result && "case" in result ? result.case : undefined;

  assert.equal(routedCase?.status, "RECOVERABLE_EXCEPTION");
  assert.deepEqual(
    harness.transitions.map((transition) => transition.to),
    ["EXPORTING", "RECOVERABLE_EXCEPTION"],
  );
});

test("WorkflowExecutionService closes the case after a successful export", async () => {
  const harness = createWorkflowExecutionHarness({
    caseStatus: "EXPORT_READY",
    exportStatus: "EXPORTED",
  });

  const result = await harness.service.handleExport({ caseId: "case-1" });
  const routedCase = result && "case" in result ? result.case : undefined;

  assert.equal(routedCase?.status, "CLOSED");
  assert.deepEqual(
    harness.transitions.map((transition) => transition.to),
    ["EXPORTING", "EXPORTED", "CLOSED"],
  );
});
