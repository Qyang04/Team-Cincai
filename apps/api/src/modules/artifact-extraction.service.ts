import { Injectable } from "@nestjs/common";
import { ArtifactsService } from "./artifacts.service";
import { AuditService } from "./audit.service";

@Injectable()
export class ArtifactExtractionService {
  constructor(
    private readonly artifactsService: ArtifactsService,
    private readonly auditService: AuditService,
  ) {}

  async processArtifact(artifactId: string) {
    const artifact = await this.artifactsService.getArtifact(artifactId);
    if (!artifact) {
      throw new Error("Artifact not found");
    }

    await this.artifactsService.markProcessing(artifactId);

    try {
      const extractedText = this.mockExtract(artifact.filename, artifact.mimeType ?? undefined);
      const updated = await this.artifactsService.markProcessed(artifactId, extractedText);

      await this.auditService.recordEvent({
        caseId: artifact.caseId,
        eventType: "ARTIFACT_PROCESSED",
        actorType: "SYSTEM",
        payload: {
          artifactId,
          filename: artifact.filename,
          processingStatus: updated.processingStatus,
        },
      });

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown artifact extraction failure.";
      const failed = await this.artifactsService.markFailed(artifactId, message);

      await this.auditService.recordEvent({
        caseId: artifact.caseId,
        eventType: "ARTIFACT_PROCESSING_FAILED",
        actorType: "SYSTEM",
        payload: {
          artifactId,
          filename: artifact.filename,
          errorMessage: message,
        },
      });

      return failed;
    }
  }

  private mockExtract(filename: string, mimeType?: string) {
    const lower = filename.toLowerCase();
    if (lower.includes("fail-process")) {
      throw new Error("Mock extraction failure triggered by filename.");
    }

    const hints = [
      lower.includes("receipt") ? "receipt" : null,
      lower.includes("invoice") ? "invoice" : null,
      mimeType ? `mime:${mimeType}` : null,
    ].filter(Boolean);

    return `mock-extracted-text(${hints.join(",") || "generic"}): ${filename}`;
  }
}
