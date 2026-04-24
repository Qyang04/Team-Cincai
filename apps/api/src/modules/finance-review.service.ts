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

  async enqueue(caseId: string, note?: string, reviewerId?: string) {
    return this.prisma.financeReview.create({
      data: {
        caseId,
        note,
        reviewerId: reviewerId ?? null,
        ownerId: reviewerId ?? null,
      },
    });
  }

  async listOpenCases(userId?: string, includeAll = false): Promise<FinanceReviewQueueItem[]> {
    const reviews = await this.prisma.financeReview.findMany({
      where: includeAll || !userId
        ? { outcome: null }
        : { outcome: null, OR: [{ reviewerId: userId }, { ownerId: userId }] },
      orderBy: { createdAt: "asc" },
      include: { case: true },
    });

    return financeReviewQueueResponseSchema.parse(
      reviews.map((review) => ({
        id: review.id,
        caseId: review.caseId,
        reviewerId: review.reviewerId,
        ...(review.ownerId ? { ownerId: review.ownerId } : {}),
        outcome: review.outcome,
        ...(review.reasonCategory ? { reasonCategory: review.reasonCategory } : {}),
        ...(review.codingDecision ? { codingDecision: review.codingDecision } : {}),
        ...(review.reconciliationStatus ? { reconciliationStatus: review.reconciliationStatus } : {}),
        ...(review.reconciledAmount !== null && review.reconciledAmount !== undefined
          ? { reconciledAmount: review.reconciledAmount }
          : {}),
        ...(review.reconciledCurrency ? { reconciledCurrency: review.reconciledCurrency } : {}),
        ...(review.annotation ? { annotation: review.annotation } : {}),
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
        ownerId: reviewerId,
        outcome,
        ...(note ? { annotation: note } : {}),
        note,
      },
    });
  }

  async resolveWithDetails(input: {
    reviewId: string;
    reviewerId: string;
    outcome: string;
    ownerId?: string;
    reasonCategory?: string;
    codingDecision?: string;
    reconciliationStatus?: string;
    reconciledAmount?: number;
    reconciledCurrency?: string;
    annotation?: string;
    note?: string;
  }) {
    return this.prisma.financeReview.update({
      where: { id: input.reviewId },
      data: {
        reviewerId: input.reviewerId,
        ownerId: input.ownerId ?? input.reviewerId,
        outcome: input.outcome,
        reasonCategory: input.reasonCategory,
        codingDecision: input.codingDecision,
        reconciliationStatus: input.reconciliationStatus,
        reconciledAmount: input.reconciledAmount,
        reconciledCurrency: input.reconciledCurrency,
        annotation: input.annotation,
        note: input.note,
      },
    });
  }

  async assignOwner(reviewId: string, ownerId: string) {
    return this.prisma.financeReview.update({
      where: { id: reviewId },
      data: { ownerId },
    });
  }

  async getOpenReviewForCase(caseId: string) {
    return this.prisma.financeReview.findFirst({
      where: { caseId, outcome: null },
      orderBy: { createdAt: "desc" },
    });
  }
}
