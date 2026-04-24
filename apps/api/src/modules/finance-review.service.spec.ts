import test from "node:test";
import assert from "node:assert/strict";
import { FinanceReviewService } from "./finance-review.service";

test("FinanceReviewService lists open review items with case context for the queue surface", async () => {
  let findManyInput: Record<string, unknown> | undefined;

  const prisma = {
    financeReview: {
      findMany: async (input: Record<string, unknown>) => {
        findManyInput = input;
        return [];
      },
    },
  };

  const service = new FinanceReviewService(prisma as never);
  await service.listOpenCases();

  assert.deepEqual(findManyInput, {
    where: {
      OR: [{ outcome: null }, { outcome: "SENT_BACK" }],
    },
    orderBy: { createdAt: "asc" },
    include: { case: true },
  });
});

test("FinanceReviewService makes newly escalated cases visible in the open review queue", async () => {
  const reviews: Array<Record<string, unknown>> = [];

  const prisma = {
    financeReview: {
      create: async ({ data }: { data: { caseId: string; note?: string } }) => {
        const review = {
          id: "review-1",
          caseId: data.caseId,
          note: data.note ?? null,
          outcome: null,
          reviewerId: null,
          createdAt: new Date("2026-04-22T09:00:00.000Z"),
          updatedAt: new Date("2026-04-22T09:00:00.000Z"),
          case: {
            id: data.caseId,
            workflowType: "EXPENSE_CLAIM",
            status: "FINANCE_REVIEW",
            priority: "HIGH",
            requesterId: "demo.requester",
            createdAt: new Date("2026-04-22T08:59:00.000Z"),
            updatedAt: new Date("2026-04-22T09:00:00.000Z"),
          },
        };
        reviews.push(review);
        return review;
      },
      findMany: async ({
        where,
      }: {
        where: { OR?: Array<{ outcome: string | null }>; outcome?: string | null };
      }) => {
        const allowedOutcomes = where.OR?.map((entry) => entry.outcome) ?? [where.outcome];
        return reviews.filter((review) => allowedOutcomes.includes((review.outcome as string | null) ?? null));
      },
    },
  };

  const service = new FinanceReviewService(prisma as never);

  await service.enqueue("case-9", "Threshold exceeded.");
  const openReviews = await service.listOpenCases();

  assert.equal(openReviews.length, 1);
  assert.deepEqual(openReviews[0], {
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
});

test("FinanceReviewService keeps sent-back reviews in the open queue for follow-up", async () => {
  const prisma = {
    financeReview: {
      findMany: async () => [
        {
          id: "review-open",
          caseId: "case-open",
          note: "Escalated by policy.",
          outcome: null,
          reviewerId: null,
          ownerId: null,
          reasonCategory: null,
          codingDecision: null,
          reconciliationStatus: null,
          reconciledAmount: null,
          reconciledCurrency: null,
          annotation: null,
          createdAt: new Date("2026-04-22T09:00:00.000Z"),
          updatedAt: new Date("2026-04-22T09:00:00.000Z"),
          case: {
            id: "case-open",
            workflowType: "EXPENSE_CLAIM",
            status: "FINANCE_REVIEW",
            priority: "HIGH",
            requesterId: "demo.requester",
            createdAt: new Date("2026-04-22T08:59:00.000Z"),
            updatedAt: new Date("2026-04-22T09:00:00.000Z"),
          },
        },
        {
          id: "review-follow-up",
          caseId: "case-follow-up",
          note: "Need clearer receipts.",
          outcome: "SENT_BACK",
          reviewerId: "fin.reviewer",
          ownerId: "fin.reviewer",
          reasonCategory: null,
          codingDecision: null,
          reconciliationStatus: null,
          reconciledAmount: null,
          reconciledCurrency: null,
          annotation: null,
          createdAt: new Date("2026-04-22T10:00:00.000Z"),
          updatedAt: new Date("2026-04-22T10:00:00.000Z"),
          case: {
            id: "case-follow-up",
            workflowType: "EXPENSE_CLAIM",
            status: "AWAITING_REQUESTER_INFO",
            priority: "MEDIUM",
            requesterId: "demo.requester",
            createdAt: new Date("2026-04-22T09:50:00.000Z"),
            updatedAt: new Date("2026-04-22T10:00:00.000Z"),
          },
        },
      ],
    },
  };

  const service = new FinanceReviewService(prisma as never);
  const openReviews = await service.listOpenCases();

  assert.equal(openReviews.length, 2);
  assert.equal(openReviews[1]?.id, "review-follow-up");
  assert.equal(openReviews[1]?.outcome, "SENT_BACK");
  assert.equal(openReviews[1]?.case.status, "AWAITING_REQUESTER_INFO");
});

test("FinanceReviewService returns analytics summary for finance operations", async () => {
  const countCalls: Array<Record<string, unknown>> = [];
  let findManyInput: Record<string, unknown> | undefined;

  const prisma = {
    financeReview: {
      count: async (input: Record<string, unknown>) => {
        countCalls.push(input);
        const where = input.where as Record<string, unknown>;
        if ((where.outcome as string | undefined) === "SENT_BACK") {
          return 2;
        }
        if ((where.outcome as string | undefined) === "APPROVED") {
          return 5;
        }
        if ((where.outcome as string | undefined) === "REJECTED") {
          return 1;
        }
        if ("AND" in where) {
          return 3;
        }
        return 7;
      },
      findMany: async (input: Record<string, unknown>) => {
        findManyInput = input;
        return [
          {
            createdAt: new Date("2026-04-20T00:00:00.000Z"),
            updatedAt: new Date("2026-04-20T12:00:00.000Z"),
          },
          {
            createdAt: new Date("2026-04-21T00:00:00.000Z"),
            updatedAt: new Date("2026-04-21T06:00:00.000Z"),
          },
        ];
      },
    },
  };

  const service = new FinanceReviewService(prisma as never);
  const analytics = await service.getFinanceReviewAnalytics();

  assert.equal(countCalls.length, 5);
  assert.deepEqual((findManyInput?.where as { outcome: { in: string[] } }).outcome, {
    in: ["APPROVED", "REJECTED"],
  });
  assert.ok((findManyInput?.where as { updatedAt: { gte: Date } }).updatedAt.gte instanceof Date);
  assert.deepEqual(findManyInput?.select, {
    createdAt: true,
    updatedAt: true,
  });
  assert.deepEqual(analytics, {
    openReviews: 7,
    sentBackOpenReviews: 2,
    approvedLast7d: 5,
    rejectedLast7d: 1,
    unassignedOpenReviews: 3,
    avgResolutionHours: 9,
  });
});
