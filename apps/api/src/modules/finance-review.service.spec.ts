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
    where: { outcome: null },
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
          },
        };
        reviews.push(review);
        return review;
      },
      findMany: async ({ where }: { where: { outcome: null } }) =>
        reviews.filter((review) => review.outcome === where.outcome),
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
    createdAt: new Date("2026-04-22T09:00:00.000Z"),
    updatedAt: new Date("2026-04-22T09:00:00.000Z"),
    case: {
      id: "case-9",
      workflowType: "EXPENSE_CLAIM",
      status: "FINANCE_REVIEW",
      priority: "HIGH",
      requesterId: "demo.requester",
    },
  });
});
