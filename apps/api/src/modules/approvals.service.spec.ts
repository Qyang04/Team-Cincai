import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalsService } from "./approvals.service";

test("ApprovalsService reopens an info-requested task as pending and clears prior decision data", async () => {
  let updateInput: Record<string, unknown> | undefined;

  const prisma = {
    approvalTask: {
      update: async (input: Record<string, unknown>) => {
        updateInput = input;
        return input;
      },
    },
  };

  const service = new ApprovalsService(prisma as never);
  await service.reopenTask("task-1");

  assert.deepEqual(updateInput, {
    where: { id: "task-1" },
    data: {
      status: "PENDING",
      decision: null,
      decisionReason: null,
    },
  });
});

test("ApprovalsService fetches the latest approval task waiting for requester follow-up", async () => {
  let findFirstInput: Record<string, unknown> | undefined;

  const prisma = {
    approvalTask: {
      findFirst: async (input: Record<string, unknown>) => {
        findFirstInput = input;
        return { id: "task-2", status: "INFO_REQUESTED" };
      },
    },
  };

  const service = new ApprovalsService(prisma as never);
  const task = await service.getLatestInfoRequestedTask("case-1");

  assert.equal(task?.id, "task-2");
  assert.deepEqual(findFirstInput, {
    where: {
      caseId: "case-1",
      status: "INFO_REQUESTED",
    },
    orderBy: { createdAt: "desc" },
    include: { case: true },
  });
});

test("ApprovalsService lists only pending tasks and includes case context for the queue surface", async () => {
  let findManyInput: Record<string, unknown> | undefined;

  const prisma = {
    approvalTask: {
      findMany: async (input: Record<string, unknown>) => {
        findManyInput = input;
        return [];
      },
    },
  };

  const service = new ApprovalsService(prisma as never);
  await service.listPendingTasks();

  assert.deepEqual(findManyInput, {
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { case: true },
  });
});

test("ApprovalsService makes a reopened task visible in the pending approval queue again", async () => {
  const tasks = [
    {
      id: "task-1",
      caseId: "case-1",
      approverId: "manager.approver",
      status: "INFO_REQUESTED",
      decision: "REQUEST_INFO",
      decisionReason: "Please confirm the business purpose.",
      dueAt: null,
      createdAt: new Date("2026-04-22T08:00:00.000Z"),
      updatedAt: new Date("2026-04-22T08:00:00.000Z"),
      case: {
        id: "case-1",
        workflowType: "EXPENSE_CLAIM",
        status: "AWAITING_APPROVER_INFO_RESPONSE",
        priority: "MEDIUM",
        requesterId: "demo.requester",
        createdAt: new Date("2026-04-22T07:55:00.000Z"),
        updatedAt: new Date("2026-04-22T08:00:00.000Z"),
      },
    },
  ];

  const prisma = {
    approvalTask: {
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const task = tasks.find((entry) => entry.id === where.id);
        if (!task) {
          throw new Error("Task not found");
        }

        Object.assign(task, data);
        return task;
      },
      findMany: async ({ where }: { where: { status: string } }) =>
        tasks.filter((task) => task.status === where.status),
    },
  };

  const service = new ApprovalsService(prisma as never);

  await service.reopenTask("task-1");
  const pendingTasks = await service.listPendingTasks();

  assert.equal(pendingTasks.length, 1);
  assert.deepEqual(pendingTasks[0], {
    id: "task-1",
    caseId: "case-1",
    approverId: "manager.approver",
    status: "PENDING",
    decision: null,
    decisionReason: null,
    dueAt: null,
    createdAt: "2026-04-22T08:00:00.000Z",
    updatedAt: "2026-04-22T08:00:00.000Z",
    case: {
      id: "case-1",
      workflowType: "EXPENSE_CLAIM",
      status: "AWAITING_APPROVER_INFO_RESPONSE",
      priority: "MEDIUM",
      requesterId: "demo.requester",
      createdAt: "2026-04-22T07:55:00.000Z",
      updatedAt: "2026-04-22T08:00:00.000Z",
    },
  });
});
