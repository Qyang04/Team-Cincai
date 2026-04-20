import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { ActorType } from "@finance-ops/shared";
import { PrismaService } from "./prisma.service";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(input: {
    caseId: string;
    eventType: string;
    actorType: ActorType;
    actorId?: string;
    payload: Record<string, unknown>;
  }) {
    return this.prisma.auditEvent.create({
      data: {
        caseId: input.caseId,
        eventType: input.eventType,
        actorType: input.actorType,
        actorId: input.actorId,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  }

  async listForCase(caseId: string) {
    return this.prisma.auditEvent.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
    });
  }
}
