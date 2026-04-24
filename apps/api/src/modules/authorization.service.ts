import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "./auth.types";
import { PrismaService } from "./prisma.service";

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async canViewCase(user: AuthenticatedUser, caseId: string): Promise<boolean> {
    if (user.roles.includes("ADMIN")) {
      return true;
    }

    const directCase = await this.prisma.case.findFirst({
      where: {
        id: caseId,
        OR: [
          ...(user.roles.includes("REQUESTER") ? [{ requesterId: user.id }] : []),
          ...(user.roles.includes("APPROVER") ? [{ approvalTasks: { some: { approverId: user.id } } }] : []),
          ...(user.roles.includes("FINANCE_REVIEWER")
            ? [{ financeReviews: { some: { OR: [{ reviewerId: user.id }, { ownerId: user.id }] } } }]
            : []),
        ],
      },
      select: { id: true },
    });

    return Boolean(directCase);
  }

  async canManageApprovalTask(user: AuthenticatedUser, taskId: string): Promise<boolean> {
    if (user.roles.includes("ADMIN")) {
      return true;
    }

    const task = await this.prisma.approvalTask.findFirst({
      where: { id: taskId, approverId: user.id },
      select: { id: true },
    });

    return Boolean(task);
  }

  async canManageFinanceReview(user: AuthenticatedUser, reviewId: string): Promise<boolean> {
    if (user.roles.includes("ADMIN")) {
      return true;
    }

    const review = await this.prisma.financeReview.findFirst({
      where: { id: reviewId, OR: [{ reviewerId: user.id }, { ownerId: user.id }] },
      select: { id: true },
    });

    return Boolean(review);
  }
}
