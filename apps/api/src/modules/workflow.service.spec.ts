import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowService } from "./workflow.service";

function createWorkflowServiceHarness(initialStatus: string | null) {
  const state = { status: initialStatus, assignedTo: null as string | null };
  const workflowTransitions: Array<Record<string, unknown>> = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  const telemetryCalls: string[] = [];

  const tx = {
    case: {
      findUnique: async () => (state.status ? { id: "case-1", status: state.status } : null),
      update: async ({ data }: { data: { status: string } }) => {
        state.status = data.status;
        return { id: "case-1", status: state.status };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { status: string };
        data: { status: string; assignedTo?: string | null };
      }) => {
        if (state.status !== where.status) {
          return { count: 0 };
        }
        state.status = data.status;
        if ("assignedTo" in data) {
          state.assignedTo = data.assignedTo ?? null;
        }
        return { count: 1 };
      },
    },
    workflowTransition: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        workflowTransitions.push(data);
        return data;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push(data);
        return data;
      },
    },
  };

  const prisma = {
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
  };

  const telemetry = {
    increment: (name: string) => {
      telemetryCalls.push(`increment:${name}`);
    },
    mark: (name: string) => {
      telemetryCalls.push(`mark:${name}`);
    },
  };

  return {
    service: new WorkflowService(prisma as never, telemetry as never),
    state,
    workflowTransitions,
    auditEvents,
    telemetryCalls,
  };
}

test("WorkflowService transitions a case when the persisted status matches the requested from-state", async () => {
  const harness = createWorkflowServiceHarness("AWAITING_APPROVAL");

  const updated = await harness.service.transitionCase({
    caseId: "case-1",
    from: "AWAITING_APPROVAL",
    to: "APPROVED",
    actorType: "APPROVER",
    actorId: "manager.approver",
    note: "Looks good.",
    assignedTo: null,
  });

  assert.equal(updated.status, "APPROVED");
  assert.equal(harness.state.status, "APPROVED");
  assert.equal(harness.state.assignedTo, null);
  assert.equal(harness.workflowTransitions.length, 1);
  assert.equal(harness.auditEvents.length, 1);
  assert.ok(harness.telemetryCalls.includes("increment:workflow.transition.AWAITING_APPROVAL.APPROVED"));
});

test("WorkflowService updates case ownership when a transition provides an assigned user", async () => {
  const harness = createWorkflowServiceHarness("POLICY_REVIEW");

  await harness.service.transitionCase({
    caseId: "case-1",
    from: "POLICY_REVIEW",
    to: "AWAITING_APPROVAL",
    actorType: "SYSTEM",
    assignedTo: "manager.approver",
  });

  assert.equal(harness.state.status, "AWAITING_APPROVAL");
  assert.equal(harness.state.assignedTo, "manager.approver");
});

test("WorkflowService rejects invalid transition edges before attempting writes", async () => {
  const harness = createWorkflowServiceHarness("REJECTED");

  await assert.rejects(
    harness.service.transitionCase({
      caseId: "case-1",
      from: "REJECTED",
      to: "EXPORT_READY",
      actorType: "SYSTEM",
    }),
    /Invalid workflow transition from REJECTED to EXPORT_READY/,
  );

  assert.equal(harness.workflowTransitions.length, 0);
  assert.equal(harness.auditEvents.length, 0);
});

test("WorkflowService rejects stale callers when the persisted status no longer matches the requested from-state", async () => {
  const harness = createWorkflowServiceHarness("FINANCE_REVIEW");

  await assert.rejects(
    harness.service.transitionCase({
      caseId: "case-1",
      from: "AWAITING_APPROVAL",
      to: "APPROVED",
      actorType: "APPROVER",
      actorId: "manager.approver",
    }),
    /expected AWAITING_APPROVAL/,
  );

  assert.equal(harness.state.status, "FINANCE_REVIEW");
  assert.equal(harness.workflowTransitions.length, 0);
  assert.equal(harness.auditEvents.length, 0);
});
