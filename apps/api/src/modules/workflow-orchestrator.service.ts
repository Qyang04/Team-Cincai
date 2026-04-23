import { Injectable } from "@nestjs/common";
import {
  caseSummarySchema,
  type CaseSummary,
  type ExtractionResult,
  type PolicyCheckResult,
  type WorkflowDecision,
} from "@finance-ops/shared";
import { queueNames } from "./queue.constants";
import { ArtifactsService } from "./artifacts.service";
import { AuditService } from "./audit.service";
import { CasesService } from "./cases.service";
import { IntakeService } from "./intake.service";
import { JobRunnerService } from "./job-runner.service";
import { WorkflowService } from "./workflow.service";

type AiIntakeResult = {
  extraction: ExtractionResult;
  decision: WorkflowDecision;
};

type PolicyRouteResult =
  | {
      case: Awaited<ReturnType<CasesService["getCase"]>>;
      policyResult: PolicyCheckResult;
    }
  | null;

type ArtifactProcessResult = Awaited<ReturnType<ArtifactsService["markProcessed"]>>;

function toIsoDateTimeString(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

function toCaseSummary(caseRecord: {
  id: string;
  workflowType: string;
  status: string;
  requesterId: string;
  assignedTo?: string | null;
  priority: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}): CaseSummary {
  return caseSummarySchema.parse({
    id: caseRecord.id,
    workflowType: caseRecord.workflowType,
    status: caseRecord.status,
    requesterId: caseRecord.requesterId,
    assignedTo: caseRecord.assignedTo ?? null,
    priority: caseRecord.priority,
    createdAt: toIsoDateTimeString(caseRecord.createdAt),
    updatedAt: toIsoDateTimeString(caseRecord.updatedAt),
  });
}

@Injectable()
export class WorkflowOrchestratorService {
  constructor(
    private readonly casesService: CasesService,
    private readonly workflowService: WorkflowService,
    private readonly artifactsService: ArtifactsService,
    private readonly auditService: AuditService,
    private readonly intakeService: IntakeService,
    private readonly jobRunner: JobRunnerService,
  ) {}

  async runPolicyAndRoute(caseId: string) {
    return this.jobRunner.dispatch<{ caseId: string }, PolicyRouteResult>(
      queueNames.policyEvaluation,
      "run-policy-and-route",
      { caseId },
    );
  }

  async recoverCase(
    caseId: string,
    actor: {
      actorType: "FINANCE_REVIEWER" | "ADMIN";
      actorId: string;
    },
  ) {
    const existing = await this.casesService.getCase(caseId);
    if (!existing) {
      return { error: "Case not found" } as const;
    }

    if (existing.status !== "RECOVERABLE_EXCEPTION") {
      return { error: "Case is not in recoverable exception" } as const;
    }

    await this.workflowService.transitionCase({
      caseId,
      from: "RECOVERABLE_EXCEPTION",
      to: "POLICY_REVIEW",
      actorType: actor.actorType,
      actorId: actor.actorId,
      note: "Manual recovery triggered from recoverable exception.",
    });

    return this.runPolicyAndRoute(caseId);
  }

  async submitDraftCase(caseId: string, input: { notes?: string; filenames: string[] }) {
    const existing = await this.casesService.getCase(caseId);
    if (!existing) {
      return { error: "Case not found" } as const;
    }

    const createdArtifacts = await this.artifactsService.attachMany(caseId, input.filenames, {
      storagePrefix: "mock://artifacts",
      processingStatus: "UPLOADED",
    });

    await Promise.all(
      createdArtifacts.map((artifact: { id: string; storageUri?: string | null }) =>
        this.processArtifactUpload(caseId, artifact.id, artifact.storageUri ?? undefined),
      ),
    );

    await this.workflowService.transitionCase({
      caseId,
      from: existing.status,
      to: "SUBMITTED",
      actorType: "REQUESTER",
      actorId: existing.requesterId,
      note: "Requester submitted the draft case.",
    });

    await this.workflowService.transitionCase({
      caseId,
      from: "SUBMITTED",
      to: "INTAKE_PROCESSING",
      actorType: "SYSTEM",
      note: "System queued intake processing.",
    });

    const aiResult = await this.jobRunner.dispatch<
      { caseId: string; workflowType: typeof existing.workflowType; notes?: string; filenames: string[] },
      AiIntakeResult
    >(
      queueNames.aiIntake,
      "analyze-intake",
      {
        caseId,
        workflowType: existing.workflowType,
        notes: input.notes,
        filenames: input.filenames,
      },
    );

    await this.workflowService.transitionCase({
      caseId,
      from: "INTAKE_PROCESSING",
      to: aiResult.decision.nextState,
      actorType: "SYSTEM",
      note: aiResult.decision.reasoningSummary,
    });

    await this.auditService.recordEvent({
      caseId,
      eventType: "AI_INTAKE_ANALYZED",
      actorType: "SYSTEM",
      payload: {
        notes: input.notes ?? null,
        filenames: input.filenames,
        extraction: aiResult.extraction,
        decision: aiResult.decision,
      },
    });

    await this.intakeService.persistIntakeResult(caseId, aiResult.extraction);

    if (aiResult.decision.nextState === "POLICY_REVIEW") {
      const routed = await this.runPolicyAndRoute(caseId);
      const finalCase = await this.casesService.getCase(caseId);
      if (!finalCase) {
        return { error: "Case not found after submission" } as const;
      }
      return {
        case: toCaseSummary(finalCase),
        aiResult,
        policyResult: routed?.policyResult ?? null,
      };
    }

    const finalCase = await this.casesService.getCase(caseId);
    if (!finalCase) {
      return { error: "Case not found after submission" } as const;
    }

    return {
      case: toCaseSummary(finalCase),
      aiResult,
      policyResult: null,
    };
  }

  async processExport(caseId: string) {
    return this.jobRunner.dispatch<{ caseId: string }, unknown>(
      queueNames.exportProcessing,
      "process-export",
      { caseId },
    );
  }

  async processArtifactUpload(caseId: string, artifactId: string, storageUri?: string) {
    const artifact = await this.artifactsService.getArtifact(artifactId);
    if (!artifact || artifact.caseId !== caseId) {
      return { error: "Artifact not found" } as const;
    }

    await this.artifactsService.markUploaded(artifactId, storageUri);

    await this.auditService.recordEvent({
      caseId,
      eventType: "ARTIFACT_UPLOADED",
      actorType: "SYSTEM",
      payload: {
        artifactId,
        filename: artifact.filename,
        storageUri: storageUri ?? artifact.storageUri ?? null,
      },
    });

    const processedArtifact = await this.jobRunner.dispatch<{ artifactId: string }, ArtifactProcessResult>(
      queueNames.artifactProcessing,
      "process-artifact",
      { artifactId },
    );

    return processedArtifact;
  }
}
