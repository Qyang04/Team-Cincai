import test from "node:test";
import assert from "node:assert/strict";
import type { QueueName } from "./queue.constants";
import { WorkflowOrchestratorService } from "./workflow-orchestrator.service";

function createWorkflowOrchestratorHarness() {
  const transitions: Array<Record<string, unknown>> = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  const attachedArtifacts: Array<Record<string, unknown>> = [];
  const processedUploads: Array<Record<string, unknown>> = [];
  const persistedIntakeResults: Array<Record<string, unknown>> = [];
  const dispatchCalls: Array<Record<string, unknown>> = [];

  const createdArtifacts = [
    { id: "artifact-1", storageUri: "mock://artifacts/receipt.jpg" },
    { id: "artifact-2", storageUri: "mock://artifacts/parking.jpg" },
  ];

  const casesService = {
    getCase: async () => ({
      id: "case-1",
      status: "DRAFT",
      workflowType: "EXPENSE_CLAIM",
      requesterId: "demo.requester",
    }),
  };

  const workflowService = {
    transitionCase: async (input: Record<string, unknown>) => {
      transitions.push(input);
      return { id: input.caseId, status: input.to };
    },
  };

  const artifactsService = {
    attachMany: async (_caseId: string, filenames: string[], defaults?: Record<string, unknown>) => {
      attachedArtifacts.push({ filenames, defaults });
      return createdArtifacts.map((artifact, index) => ({
        ...artifact,
        filename: filenames[index],
      }));
    },
    getArtifact: async (artifactId: string) => ({
      id: artifactId,
      caseId: "case-1",
      filename: artifactId === "artifact-1" ? "receipt.jpg" : "parking.jpg",
      storageUri: `mock://artifacts/${artifactId}.jpg`,
    }),
    markUploaded: async (_artifactId: string, _storageUri?: string) => undefined,
    markProcessed: async () => undefined,
  };

  const auditService = {
    recordEvent: async (input: Record<string, unknown>) => {
      auditEvents.push(input);
      return input;
    },
  };

  const intakeService = {
    persistIntakeResult: async (caseId: string, extraction: Record<string, unknown>) => {
      persistedIntakeResults.push({ caseId, extraction });
      return undefined;
    },
  };

  const aiResult = {
    extraction: {
      fields: {
        amount: 75,
        projectCode: "OPS-12",
      },
      confidence: 0.9,
      provenance: {
        amount: "notes",
        projectCode: "notes",
      },
      openQuestions: [],
    },
    decision: {
      recommendedAction: "advance_to_policy_review",
      reasoningSummary: "Ready for policy review.",
      nextState: "POLICY_REVIEW",
      requiredApproverRole: "APPROVER",
    },
  };

  const policyRouteResult = {
    case: { id: "case-1", status: "AWAITING_APPROVAL" },
    policyResult: {
      passed: true,
      warnings: [],
      blockingIssues: [],
      requiresFinanceReview: false,
      duplicateSignals: [],
    },
  };

  const jobRunner = {
    dispatch: async <TPayload, TResult>(queueName: QueueName, jobName: string, payload: TPayload) => {
      dispatchCalls.push({ queueName, jobName, payload });
      if (jobName === "process-artifact") {
        const artifactPayload = payload as { artifactId: string };
        processedUploads.push(artifactPayload);
        return { id: artifactPayload.artifactId, processingStatus: "PROCESSED" } as TResult;
      }
      if (jobName === "analyze-intake") {
        return aiResult as TResult;
      }
      if (jobName === "run-policy-and-route") {
        return policyRouteResult as TResult;
      }
      if (jobName === "process-export") {
        return { case: { id: "case-1", status: "CLOSED" } } as TResult;
      }
      throw new Error(`Unexpected job ${jobName}`);
    },
  };

  const service = new WorkflowOrchestratorService(
    casesService as never,
    workflowService as never,
    artifactsService as never,
    auditService as never,
    intakeService as never,
    jobRunner as never,
  );

  return {
    service,
    transitions,
    auditEvents,
    attachedArtifacts,
    processedUploads,
    persistedIntakeResults,
    dispatchCalls,
    aiResult,
    policyRouteResult,
  };
}

test("WorkflowOrchestratorService submits a draft case through intake and policy routing", async () => {
  const harness = createWorkflowOrchestratorHarness();

  const result = await harness.service.submitDraftCase("case-1", {
    notes: "Lunch reimbursement OPS-12 75 MYR",
    filenames: ["receipt.jpg", "parking.jpg"],
  });

  assert.deepEqual(
    harness.transitions.map((transition) => transition.to),
    ["SUBMITTED", "INTAKE_PROCESSING", "POLICY_REVIEW"],
  );
  assert.equal(harness.attachedArtifacts.length, 1);
  assert.equal(harness.processedUploads.length, 2);
  assert.equal(harness.persistedIntakeResults.length, 1);
  const routedCase = "case" in result ? result.case : undefined;
  assert.equal(routedCase?.status, "AWAITING_APPROVAL");
  assert.deepEqual(result.policyResult, harness.policyRouteResult.policyResult);
  assert.equal(harness.auditEvents[2]?.eventType, "AI_INTAKE_ANALYZED");
});

test("WorkflowOrchestratorService returns clarification state when AI intake needs requester follow-up", async () => {
  const harness = createWorkflowOrchestratorHarness();

  const jobRunner = harness.service["jobRunner"] as {
    dispatch: <TPayload, TResult>(
      queueName: QueueName,
      jobName: string,
      payload: TPayload,
    ) => Promise<TResult>;
  };
  const originalDispatch = jobRunner.dispatch.bind(jobRunner);

  jobRunner.dispatch = async <TPayload, TResult>(
    queueName: QueueName,
    jobName: string,
    payload: TPayload,
  ) => {
    if (jobName === "analyze-intake") {
      return {
        extraction: {
          fields: { amount: 75 },
          confidence: 0.55,
          provenance: { amount: "notes" },
          openQuestions: ["What is the project code for this request?"],
        },
        decision: {
          recommendedAction: "request_clarification",
          reasoningSummary: "Project code is missing.",
          nextState: "AWAITING_REQUESTER_INFO",
          requiredApproverRole: "APPROVER",
        },
      } as TResult;
    }

    return originalDispatch(queueName, jobName, payload);
  };

  const result = await harness.service.submitDraftCase("case-1", {
    notes: "Lunch reimbursement 75 MYR",
    filenames: ["receipt.jpg"],
  });

  assert.deepEqual(
    harness.transitions.map((transition) => transition.to),
    ["SUBMITTED", "INTAKE_PROCESSING", "AWAITING_REQUESTER_INFO"],
  );
  const clarifiedCase = "case" in result ? result.case : undefined;
  assert.equal(clarifiedCase?.status, "AWAITING_REQUESTER_INFO");
  assert.equal(result.policyResult, null);
  assert.equal(harness.persistedIntakeResults.length, 1);
  assert.equal(harness.auditEvents[1]?.eventType, "ARTIFACT_UPLOADED");
  assert.equal(harness.auditEvents[harness.auditEvents.length - 1]?.eventType, "AI_INTAKE_ANALYZED");
});
