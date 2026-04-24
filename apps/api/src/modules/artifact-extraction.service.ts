import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { ArtifactsService } from "./artifacts.service";
import { AuditService } from "./audit.service";
import { LocalArtifactStorageService } from "./local-artifact-storage.service";

const TEXT_MIME_HINTS = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded)|message\/)/i;

@Injectable()
export class ArtifactExtractionService {
  constructor(
    private readonly artifactsService: ArtifactsService,
    private readonly auditService: AuditService,
    private readonly localArtifactStorage: LocalArtifactStorageService,
  ) {}

  async processArtifact(artifactId: string) {
    const artifact = await this.artifactsService.getArtifact(artifactId);
    if (!artifact) {
      throw new Error("Artifact not found");
    }

    await this.artifactsService.markProcessing(artifactId);

    try {
      const extractedText = await this.mockExtract(
        artifact.filename,
        artifact.mimeType ?? undefined,
        artifact.storageUri ?? undefined,
      );
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

  private async mockExtract(filename: string, mimeType?: string, storageUri?: string) {
    const lower = filename.toLowerCase();
    if (lower.includes("fail-process")) {
      throw new Error("Mock extraction failure triggered by filename.");
    }

    const hints = [
      lower.includes("receipt") ? "receipt" : null,
      lower.includes("invoice") ? "invoice" : null,
      mimeType ? `mime:${mimeType}` : null,
    ].filter(Boolean);

    let fileSnippet = "";
    if (storageUri) {
      const localPath = this.localArtifactStorage.resolveLocalPath(storageUri);
      if (localPath) {
        try {
          const buf = await readFile(localPath);
          const asText = TEXT_MIME_HINTS.test(mimeType ?? "") || lower.endsWith(".txt") || lower.endsWith(".csv");
          if (asText) {
            fileSnippet = buf.toString("utf8").slice(0, 24_000);
          } else {
            fileSnippet = `[binary file ${buf.byteLength} bytes on disk]`;
          }
        } catch {
          fileSnippet = "[local file read failed]";
        }
      }
    }

    const base = `mock-extracted-text(${hints.join(",") || "generic"}): ${filename}`;
    return fileSnippet ? `${base}\n\n--- file content ---\n${fileSnippet}` : base;
  }
}
