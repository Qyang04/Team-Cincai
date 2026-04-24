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

  const service = new ApprovalsService(
    prisma as never,
    { getDelegationConfig: async () => ({ rules: [] }) } as never,
    { send: async () => ({ delivered: true }) } as never,
    { getUserById: async () => null } as never,
  );
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

  const service = new ApprovalsService(
    prisma as never,
    { getDelegationConfig: async () => ({ rules: [] }) } as never,
    { send: async () => ({ delivered: true }) } as never,
    { getUserById: async () => null } as never,
  );
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

  const service = new ApprovalsService(
    prisma as never,
    { getDelegationConfig: async () => ({ rules: [] }) } as never,
    { send: async () => ({ delivered: true }) } as never,
    { getUserById: async () => null } as never,
  );
  await service.listPendingTasks();

  assert.deepEqual(findManyInput, {
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { case: true, stage: true },
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

  const service = new ApprovalsService(
    prisma as never,
    { getDelegationConfig: async () => ({ rules: [] }) } as never,
    { send: async () => ({ delivered: true }) } as never,
    { getUserById: async () => null } as never,
  );

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

test("ApprovalsService escalates overdue stages with escalation targets", async () => {
  const updatedTaskIds: string[] = [];
  const notifications: string[] = [];
  let updatedStageId: string | null = null;

  const prisma = {
    approvalStage: {
      findMany: async () => [
        {
          id: "stage-1",
          stageNumber: 2,
          escalatesTo: "director.approver",
          tasks: [{ id: "task-1", approverId: "manager.approver", status: "PENDING" }],
          matrix: { caseId: "case-1", status: "ACTIVE" },
        },
      ],
      update: async ({ where }: { where: { id: string } }) => {
        updatedStageId = where.id;
        return {};
      },
    },
    approvalTask: {
      update: async ({ where }: { where: { id: string } }) => {
        updatedTaskIds.push(where.id);
        return {};
      },
    },
    adminSetting: {
      findUnique: async () => null,
      upsert: async () => ({}),
    },
  };

  const service = new ApprovalsService(
    prisma as never,
    { getDelegationConfig: async () => ({ rules: [] }) } as never,
    {
      send: async ({ type }: { type: string }) => {
        notifications.push(type);
        return { delivered: true };
      },
    } as never,
    { getUserById: async () => null } as never,
  );

  const result = await service.runSlaBreachSweep();
  assert.deepEqual(result, { escalatedStages: 1, escalatedTasks: 1, reminderCandidates: 0 });
  assert.deepEqual(updatedTaskIds, ["task-1"]);
  assert.equal(updatedStageId, "stage-1");
  assert.deepEqual(notifications, ["APPROVAL_SLA_ESCALATED"]);
});

test("ApprovalsService sends reminders for overdue stages without escalation", async () => {
  const notifications: string[] = [];
  let reminderStateSaved = false;

  const prisma = {
    approvalStage: {
      findMany: async () => [
        {
          id: "stage-r1",
          stageNumber: 1,
          escalatesTo: null,
          tasks: [{ id: "task-r1", approverId: "manager.approver", status: "PENDING" }],
          matrix: { caseId: "case-2", status: "ACTIVE" },
        },
      ],
    },
    adminSetting: {
      findUnique: async () => ({ key: "approvalSlaReminderState", value: {} }),
      upsert: async () => {
        reminderStateSaved = true;
        return {};
      },
    },
  };

  const service = new ApprovalsService(
    prisma as never,
    { getDelegationConfig: async () => ({ rules: [] }) } as never,
    {
      send: async ({ type }: { type: string }) => {
        notifications.push(type);
        return { delivered: true };
      },
    } as never,
    { getUserById: async () => null } as never,
  );

  const result = await service.runSlaBreachSweep();
  assert.deepEqual(result, { escalatedStages: 0, escalatedTasks: 0, reminderCandidates: 1 });
  assert.deepEqual(notifications, ["APPROVAL_SLA_REMINDER"]);
  assert.equal(reminderStateSaved, true);
});

test("ApprovalsService notifies next-stage approvers when blocked tasks are activated", async () => {
  const notifications: Array<{ type: string; recipientId: string; caseId?: string; subject: string }> = [];

  const prisma = {
    approvalTask: {
      findMany: async ({
        where,
      }: {
        where: { caseId: string; stageNumber: number; status: string };
      }) => {
        if (where.status === "BLOCKED") {
          return [
            { id: "task-s2-a", stageNumber: 2, createdAt: new Date("2026-04-22T08:00:00.000Z"), caseId: "case-9" },
            { id: "task-s2-b", stageNumber: 2, createdAt: new Date("2026-04-22T08:01:00.000Z"), caseId: "case-9" },
          ];
        }
        return [{ approverId: "director.approver" }, { approverId: "finance.backup" }];
      },
      updateMany: async () => ({ count: 2 }),
    },
    approvalStage: {
      updateMany: async () => ({ count: 1 }),
    },
  };

  const service = new ApprovalsService(
    prisma as never,
    { getDelegationConfig: async () => ({ rules: [] }) } as never,
    {
      send: async (input: { type: string; recipientId: string; caseId?: string; subject: string }) => {
        notifications.push(input);
        return { delivered: true };
      },
    } as never,
    { getUserById: async () => null } as never,
  );

  const result = await service.activateNextStage("case-9", 1);
  assert.deepEqual(result, { activated: true, nextStage: 2 });
  assert.deepEqual(
    notifications.map((entry) => entry.recipientId).sort(),
    ["director.approver", "finance.backup"].sort(),
  );
  assert.ok(notifications.every((entry) => entry.type === "approval-required"));
});

test("ApprovalsService notifies delegated approver after manual delegation", async () => {
  const notifications: Array<{ type: string; recipientId: string; caseId?: string; subject: string }> = [];

  const prisma = {
    approvalTask: {
      update: async () => ({ id: "task-7", caseId: "case-7", approverId: "delegate.approver" }),
    },
  };

  const service = new ApprovalsService(
    prisma as never,
    { getDelegationConfig: async () => ({ rules: [] }) } as never,
    {
      send: async (input: { type: string; recipientId: string; caseId?: string; subject: string }) => {
        notifications.push(input);
        return { delivered: true };
      },
    } as never,
    { getUserById: async () => null } as never,
  );

  await service.delegateTask({
    taskId: "task-7",
    fromApproverId: "manager.approver",
    toApproverId: "delegate.approver",
    reason: "Out of office",
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.type, "approval-required");
  assert.equal(notifications[0]?.recipientId, "delegate.approver");
  assert.equal(notifications[0]?.subject, "Approval task delegated to you");
  assert.equal(notifications[0]?.caseId, "case-7");
});
