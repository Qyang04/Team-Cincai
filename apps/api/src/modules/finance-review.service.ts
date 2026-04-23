import { Injectable } from "@nestjs/common";
import {
  financeReviewQueueResponseSchema,
  type FinanceReviewQueueItem,
} from "@finance-ops/shared";
import { PrismaService } from "./prisma.service";

function toIsoDateTimeString(value: Date | string | null | undefined) {
  if (value === null || value === undefined) {
    return value;
  }
  return typeof value === "string" ? value : value.toISOString();
}

@Injectable()
export class FinanceReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(caseId: string, note?: string) {
    return this.prisma.financeReview.create({
      data: {
        caseId,
        note,
      },
    });
  }

  async listOpenCases(): Promise<FinanceReviewQueueItem[]> {
    const reviews = await this.prisma.financeReview.findMany({
      where: { outcome: null },
      orderBy: { createdAt: "asc" },
      include: { case: true },
    });

    return financeReviewQueueResponseSchema.parse(
      reviews.map((review) => ({
        id: review.id,
        caseId: review.caseId,
        reviewerId: review.reviewerId,
        outcome: review.outcome,
        note: review.note,
        createdAt: toIsoDateTimeString(review.createdAt),
        updatedAt: toIsoDateTimeString(review.updatedAt),
        case: {
          id: review.case.id,
          workflowType: review.case.workflowType,
          status: review.case.status,
          priority: review.case.priority,
          requesterId: review.case.requesterId,
          createdAt: toIsoDateTimeString(review.case.createdAt),
          updatedAt: toIsoDateTimeString(review.case.updatedAt),
        },
      })),
    );
  }

  async resolve(reviewId: string, reviewerId: string, outcome: string, note?: string) {
    return this.prisma.financeReview.update({
      where: { id: reviewId },
      data: {
        reviewerId,
        outcome,
        note,
      },
    });
  }

  async getOpenReviewForCase(caseId: string) {
    return this.prisma.financeReview.findFirst({
      where: { caseId, outcome: null },
      orderBy: { createdAt: "desc" },
    });
  }
}
