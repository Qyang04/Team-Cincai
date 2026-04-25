import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  caseSummarySchema,
  type CaseStatus,
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

type IntakeArtifactEvidence = {
  id: string;
  filename: string;
  mimeType?: string | null;
  source?: string | null;
  extractedText?: string | null;
  processingStatus: string;
  checksum?: string | null;
  metadata?: Record<string, unknown> | null;
};

function hasEmptyExtractedText(artifact: IntakeArtifactEvidence): boolean {
  if (artifact.processingStatus !== "PROCESSED") {
    return false;
  }
  return (artifact.extractedText ?? "").trim().length === 0;
}

function hasExtractionWarnings(artifact: IntakeArtifactEvidence): boolean {
  if (artifact.processingStatus !== "PROCESSED") {
    return false;
  }
  const metadata = artifact.metadata;
  if (!metadata || typeof metadata !== "object") {
    return false;
  }
  const warnings = metadata.extractionWarnings;
  return Array.isArray(warnings) && warnings.length > 0;
}

// Only cases whose workflow position still depends on fresh intake evidence are eligible
// for a silent re-ingestion. DRAFT is excluded because submitDraftCase owns that path and
// runs the first intake pass itself. INTAKE_PROCESSING is excluded to avoid racing the
// concurrent analyze-intake dispatch submitDraftCase triggers right after upload. Anything
// at or past APPROVED must not have its extraction rewritten from under a reviewer.
const RETRY_REFRESH_STATUSES = new Set<CaseStatus>([
  "AWAITING_REQUESTER_INFO",
  "POLICY_REVIEW",
  "FINANCE_REVIEW",
  "RECOVERABLE_EXCEPTION",
]);

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
      assignedTo: actor.actorId,
    });

    return this.runPolicyAndRoute(caseId);
  }

  async submitDraftCase(caseId: string, input: { notes?: string; filenames: string[] }) {
    const existing = await this.casesService.getCase(caseId);
    if (!existing) {
      return { error: "Case not found" } as const;
    }

    let filenamesForIntake: string[];

    if (input.filenames.length > 0) {
      const createdArtifacts = await this.artifactsService.attachMany(caseId, input.filenames, {
        storagePrefix: "mock://artifacts",
        processingStatus: "UPLOADED",
      });

      await Promise.all(
        createdArtifacts.map((artifact: { id: string; storageUri?: string | null }) =>
          this.processArtifactUpload(caseId, artifact.id, artifact.storageUri ?? undefined),
        ),
      );

      filenamesForIntake = input.filenames;
    } else {
      const existingArtifacts = await this.artifactsService.listForCase(caseId);
      const ready = existingArtifacts.filter(
        (artifact) => artifact.processingStatus === "PROCESSED" || artifact.processingStatus === "UPLOADED",
      );
      if (!ready.length) {
        return {
          error:
            "No artifacts to submit: add files using the upload control, or provide at least one filename for mock-only artifacts.",
        } as const;
      }
      filenamesForIntake = ready.map((artifact) => artifact.filename);
    }

    const intakeArtifacts = await this.collectIntakeArtifacts(caseId);

    const blockedArtifacts = intakeArtifacts.filter(
      (artifact) => hasEmptyExtractedText(artifact) || hasExtractionWarnings(artifact),
    );
    if (blockedArtifacts.length > 0) {
      const replacementCase = await this.casesService.createCase({
        workflowType: existing.workflowType,
        requesterId: existing.requesterId,
      });

      await this.auditService.recordEvent({
        caseId,
        eventType: "SUBMISSION_BLOCKED_EMPTY_EXTRACTION",
        actorType: "SYSTEM",
        payload: {
          blockedArtifactIds: blockedArtifacts.map((artifact) => artifact.id),
          blockedFilenames: blockedArtifacts.map((artifact) => artifact.filename),
          blockedReasons: blockedArtifacts.map((artifact) => ({
            artifactId: artifact.id,
            filename: artifact.filename,
            hasEmptyExtractedText: hasEmptyExtractedText(artifact),
            hasExtractionWarnings: hasExtractionWarnings(artifact),
          })),
          replacementCaseId: replacementCase.id,
        },
      });

      return {
        error: `Submission blocked: one or more files could not be read reliably (empty extracted text or extraction warnings). A new draft case (${replacementCase.id}) was created automatically. Please open the new case and re-upload clearer files before submitting again.`,
      } as const;
    }

    await this.workflowService.transitionCase({
      caseId,
      from: existing.status,
      to: "SUBMITTED",
      actorType: "REQUESTER",
      actorId: existing.requesterId,
      note: "Requester submitted the draft case.",
      assignedTo: existing.requesterId,
    });

    await this.workflowService.transitionCase({
      caseId,
      from: "SUBMITTED",
      to: "INTAKE_PROCESSING",
      actorType: "SYSTEM",
      note: "System queued intake processing.",
      assignedTo: existing.requesterId,
    });

    const aiResult = await this.jobRunner.dispatch<
      {
        caseId: string;
        workflowType: typeof existing.workflowType;
        notes?: string;
        artifacts: Array<{
          id: string;
          filename: string;
          mimeType?: string | null;
          source?: string | null;
          extractedText?: string | null;
          processingStatus: string;
          checksum?: string | null;
          metadata?: Record<string, unknown> | null;
        }>;
      },
      AiIntakeResult
    >(
      queueNames.aiIntake,
      "analyze-intake",
      {
        caseId,
        workflowType: existing.workflowType,
        notes: input.notes,
        artifacts: intakeArtifacts,
      },
    );

    await this.workflowService.transitionCase({
      caseId,
      from: "INTAKE_PROCESSING",
      to: aiResult.decision.nextState,
      actorType: "SYSTEM",
      note: aiResult.decision.reasoningSummary,
      assignedTo: existing.requesterId,
    });

    await this.auditService.recordEvent({
      caseId,
      eventType: "AI_INTAKE_ANALYZED",
      actorType: "SYSTEM",
      payload: {
        notes: input.notes ?? null,
        filenames: filenamesForIntake,
        artifacts: intakeArtifacts.map((artifact) => ({
          id: artifact.id,
          filename: artifact.filename,
          source: artifact.source ?? null,
          extractionMethod:
            typeof artifact.metadata?.extractionMethod === "string" ? artifact.metadata.extractionMethod : null,
          extractionWarnings: Array.isArray(artifact.metadata?.extractionWarnings)
            ? artifact.metadata.extractionWarnings
            : [],
          hasExtractedText: Boolean(artifact.extractedText),
          processingStatus: artifact.processingStatus,
        })),
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

    if (processedArtifact && (processedArtifact as { processingStatus?: string }).processingStatus === "PROCESSED") {
      // Fire-and-forget semantics are avoided: callers (upload-complete endpoint, admin reprocess)
      // expect the full re-ingest chain to have settled by the time they poll the case detail.
      await this.refreshIntakeAndPolicy(caseId, artifactId);
    }

    return processedArtifact;
  }

  private async collectIntakeArtifacts(caseId: string): Promise<IntakeArtifactEvidence[]> {
    const artifacts = await this.artifactsService.listForCase(caseId);
    return artifacts
      .filter((artifact) => artifact.processingStatus !== "FAILED")
      .map((artifact) => ({
        id: artifact.id,
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        source: artifact.source,
        extractedText: artifact.extractedText,
        processingStatus: artifact.processingStatus,
        checksum: artifact.checksum,
        metadata:
          artifact.metadata && typeof artifact.metadata === "object"
            ? (artifact.metadata as Record<string, unknown>)
            : null,
      }));
  }

  private computeEvidenceDigest(artifacts: IntakeArtifactEvidence[]): string {
    // Sort by id so the digest is stable regardless of artifact ordering from the DB,
    // and include length as a cheap integrity signal alongside the raw text.
    const sorted = [...artifacts].sort((a, b) => a.id.localeCompare(b.id));
    const payload = sorted
      .map((artifact) => {
        const text = artifact.extractedText ?? "";
        return `${artifact.id}:${text.length}:${text}`;
      })
      .join("\n");
    return createHash("sha256").update(payload).digest("hex");
  }

  private async refreshIntakeAndPolicy(caseId: string, triggerArtifactId: string) {
    const caseRecord = await this.casesService.getCase(caseId);
    if (!caseRecord) {
      return null;
    }
    if (!RETRY_REFRESH_STATUSES.has(caseRecord.status as CaseStatus)) {
      return null;
    }

    const intakeArtifacts = await this.collectIntakeArtifacts(caseId);
    const evidenceDigest = this.computeEvidenceDigest(intakeArtifacts);

    const priorExtraction = await this.intakeService.getLatestExtraction(caseId);
    const priorDigest =
      priorExtraction?.modelMetadata && typeof priorExtraction.modelMetadata === "object"
        ? (priorExtraction.modelMetadata as Record<string, unknown>).evidenceDigest
        : undefined;

    if (typeof priorDigest === "string" && priorDigest === evidenceDigest) {
      // Artifact was reprocessed but the extracted text is byte-equal; skip AI + policy churn.
      return null;
    }

    const aiResult = await this.jobRunner.dispatch<
      {
        caseId: string;
        workflowType: typeof caseRecord.workflowType;
        artifacts: IntakeArtifactEvidence[];
      },
      AiIntakeResult
    >(
      queueNames.aiIntake,
      "analyze-intake",
      {
        caseId,
        workflowType: caseRecord.workflowType,
        artifacts: intakeArtifacts,
      },
    );

    const enrichedExtraction: ExtractionResult = {
      ...aiResult.extraction,
      modelMetadata: {
        ...(aiResult.extraction.modelMetadata ?? {}),
        evidenceDigest,
        reingestionTrigger: {
          artifactId: triggerArtifactId,
          priorExtractionId: priorExtraction?.id ?? null,
        },
      },
    };

    await this.intakeService.persistIntakeResult(caseId, enrichedExtraction);
    const newExtraction = await this.intakeService.getLatestExtraction(caseId);

    await this.auditService.recordEvent({
      caseId,
      eventType: "ARTIFACT_RETRY_REINGESTED",
      actorType: "SYSTEM",
      payload: {
        artifactId: triggerArtifactId,
        priorExtractionId: priorExtraction?.id ?? null,
        newExtractionId: newExtraction?.id ?? null,
        caseStatus: caseRecord.status,
        aiDecision: aiResult.decision,
      },
    });

    if (caseRecord.status === "POLICY_REVIEW") {
      await this.runPolicyAndRoute(caseId);
      return aiResult;
    }

    if (caseRecord.status === "AWAITING_REQUESTER_INFO") {
      // If the new extraction left no open questions (AI-sourced ones were replaced inside
      // persistIntakeResult) and no other source still has an OPEN row, the case would be
      // stranded. Advance it back to policy review and re-route.
      const questions = await this.intakeService.listQuestions(caseId);
      const anyOpen = questions.some((question) => question.status === "OPEN");
      if (!anyOpen && aiResult.decision.nextState === "POLICY_REVIEW") {
        await this.workflowService.transitionCase({
          caseId,
          from: "AWAITING_REQUESTER_INFO",
          to: "POLICY_REVIEW",
          actorType: "SYSTEM",
          note: "Artifact retry produced sufficient evidence; resuming policy review.",
          assignedTo: caseRecord.requesterId,
        });
        await this.runPolicyAndRoute(caseId);
      }
    }

    // FINANCE_REVIEW and RECOVERABLE_EXCEPTION: extraction has been refreshed and the audit
    // event is in place, but no automatic re-routing is performed. A reviewer/admin will pick
    // up the new data through the existing "Run policy review" / recovery paths.
    return aiResult;
  }
}
