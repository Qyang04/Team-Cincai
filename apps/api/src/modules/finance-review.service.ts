import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

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

  async listOpenCases() {
    return this.prisma.financeReview.findMany({
      where: { outcome: null },
      orderBy: { createdAt: "asc" },
      include: { case: true },
    });
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

