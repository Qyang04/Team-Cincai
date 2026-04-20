import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { canTransition, type ActorType, type CaseStatus } from "@finance-ops/shared";
import { PrismaService } from "./prisma.service";
import { TelemetryService } from "./telemetry.service";

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService,
  ) {}

  assertTransition(current: CaseStatus, next: CaseStatus) {
    if (!canTransition(current, next)) {
      throw new Error(`Invalid workflow transition from ${current} to ${next}`);
    }
  }

  async transitionCase(input: {
    caseId: string;
    from: CaseStatus;
    to: CaseStatus;
    actorType: ActorType;
    actorId?: string;
    note?: string;
  }) {
    this.assertTransition(input.from, input.to);
    this.telemetry.increment(`workflow.transition.${input.from}.${input.to}`);
    this.telemetry.increment("workflow.transition.total");
    this.telemetry.mark("workflow.lastTransitionAt");

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedCase = await tx.case.update({
        where: { id: input.caseId },
        data: { status: input.to },
      });

      await tx.workflowTransition.create({
        data: {
          caseId: input.caseId,
          fromStatus: input.from,
          toStatus: input.to,
          actorType: input.actorType,
          actorId: input.actorId,
          note: input.note,
        },
      });

      await tx.auditEvent.create({
        data: {
          caseId: input.caseId,
          eventType: "CASE_STATUS_CHANGED",
          actorType: input.actorType,
          actorId: input.actorId,
          payload: {
            fromStatus: input.from,
            toStatus: input.to,
            note: input.note ?? null,
          },
        },
      });

      return updatedCase;
    });
  }
}
