import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ArtifactsService } from "./artifacts.service";
import { AuditService } from "./audit.service";
import { DocumentOcrService } from "./document-ocr.service";
import { LocalArtifactStorageService } from "./local-artifact-storage.service";
import { PdfTextExtractionService } from "./pdf-text-extraction.service";

const TEXT_MIME_HINTS = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded)|message\/)/i;
const IMAGE_MIME_HINTS = /^image\//i;
const PDF_MIME_HINTS = /^application\/pdf$/i;

type ArtifactRecord = Awaited<ReturnType<ArtifactsService["getArtifact"]>>;

type ExtractionOutcome = {
  extractedText: string;
  checksum: string | null;
  metadata: Record<string, unknown>;
  warnings: string[];
};

function isTextLike(filename: string, mimeType?: string | null) {
  const lower = filename.toLowerCase();
  return TEXT_MIME_HINTS.test(mimeType ?? "") || lower.endsWith(".txt") || lower.endsWith(".csv");
}

function isPdf(filename: string, mimeType?: string | null) {
  return PDF_MIME_HINTS.test(mimeType ?? "") || filename.toLowerCase().endsWith(".pdf");
}

function isImage(filename: string, mimeType?: string | null) {
  const lower = filename.toLowerCase();
  return IMAGE_MIME_HINTS.test(mimeType ?? "") || [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"].some((ext) => lower.endsWith(ext));
}

function buildChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeInlineText(value: string): string {
  return value.replace(/\u0000/g, "").trim();
}

@Injectable()
export class ArtifactExtractionService {
  constructor(
    private readonly artifactsService: ArtifactsService,
    private readonly auditService: AuditService,
    private readonly localArtifactStorage: LocalArtifactStorageService,
    private readonly documentOcrService: DocumentOcrService,
    private readonly pdfTextExtractionService: PdfTextExtractionService,
  ) {}

  async processArtifact(artifactId: string) {
    const artifact = await this.artifactsService.getArtifact(artifactId);
    if (!artifact) {
      throw new Error("Artifact not found");
    }

    await this.artifactsService.markProcessing(artifactId);

    try {
      const outcome = await this.extractArtifact(artifact);
      const updated = await this.artifactsService.markProcessed(artifactId, {
        extractedText: outcome.extractedText,
        checksum: outcome.checksum,
        metadata: outcome.metadata,
      });

      await this.auditService.recordEvent({
        caseId: artifact.caseId,
        eventType: "ARTIFACT_PROCESSED",
        actorType: "SYSTEM",
        payload: {
          artifactId,
          filename: artifact.filename,
          extractionMethod: outcome.metadata.extractionMethod,
          extractionWarnings: outcome.warnings,
          textLength: outcome.extractedText.length,
          checksum: outcome.checksum,
          processingStatus: updated.processingStatus,
        },
      });

      if (outcome.warnings.length > 0) {
        await this.auditService.recordEvent({
          caseId: artifact.caseId,
          eventType: "ARTIFACT_EXTRACTION_WARNING",
          actorType: "SYSTEM",
          payload: {
            artifactId,
            filename: artifact.filename,
            extractionMethod: outcome.metadata.extractionMethod,
            warnings: outcome.warnings,
          },
        });
      }

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

  private async extractArtifact(artifact: NonNullable<ArtifactRecord>): Promise<ExtractionOutcome> {
    const mimeType = artifact.mimeType ?? undefined;
    const localPath = artifact.storageUri ? this.localArtifactStorage.resolveLocalPath(artifact.storageUri) : null;
    const warnings: string[] = [];

    if (!localPath) {
      const extractedText = this.createMockOnlyPlaceholder(artifact.filename, mimeType, artifact.source ?? undefined);
      warnings.push("Artifact has no local file; used mock placeholder extraction.");
      return {
        extractedText,
        checksum: null,
        warnings,
        metadata: {
          extractionMethod: "MOCK_PLACEHOLDER",
          extractionWarnings: warnings,
          hasLocalFile: false,
          mimeType: mimeType ?? null,
          source: artifact.source ?? null,
        },
      };
    }

    const buffer = await readFile(localPath);
    const checksum = buildChecksum(buffer);

    if (isTextLike(artifact.filename, mimeType)) {
      const extractedText = normalizeInlineText(buffer.toString("utf8").slice(0, 24_000));
      return {
        extractedText,
        checksum,
        warnings,
        metadata: {
          extractionMethod: "TEXT_READ",
          extractionWarnings: warnings,
          hasLocalFile: true,
          byteLength: buffer.byteLength,
          mimeType: mimeType ?? null,
          source: artifact.source ?? null,
        },
      };
    }

    if (isPdf(artifact.filename, mimeType)) {
      const extractedText = await this.pdfTextExtractionService.extractText(buffer);
      if (!extractedText) {
        warnings.push("PDF had no embedded text. Scanned PDF OCR is not enabled in this workflow yet.");
      }
      return {
        extractedText,
        checksum,
        warnings,
        metadata: {
          extractionMethod: extractedText ? "PDF_TEXT" : "PDF_TEXT_EMPTY",
          extractionWarnings: warnings,
          hasLocalFile: true,
          byteLength: buffer.byteLength,
          mimeType: mimeType ?? null,
          source: artifact.source ?? null,
        },
      };
    }

    if (isImage(artifact.filename, mimeType)) {
      const extractedText = await this.documentOcrService.extractJoinedText([buffer]);
      if (!extractedText) {
        warnings.push("OCR did not detect text in the uploaded image.");
      }
      return {
        extractedText,
        checksum,
        warnings,
        metadata: {
          extractionMethod: "OCR_IMAGE",
          extractionWarnings: warnings,
          hasLocalFile: true,
          byteLength: buffer.byteLength,
          mimeType: mimeType ?? null,
          source: artifact.source ?? null,
        },
      };
    }

    warnings.push("Artifact type is not supported for text extraction.");
    return {
      extractedText: "",
      checksum,
      warnings,
      metadata: {
        extractionMethod: "UNSUPPORTED_BINARY",
        extractionWarnings: warnings,
        hasLocalFile: true,
        byteLength: buffer.byteLength,
        mimeType: mimeType ?? null,
        source: artifact.source ?? null,
      },
    };
  }

  private createMockOnlyPlaceholder(filename: string, mimeType?: string, source?: string) {
    const hints = [
      filename.toLowerCase().includes("receipt") ? "receipt" : null,
      filename.toLowerCase().includes("invoice") ? "invoice" : null,
      mimeType ? `mime:${mimeType}` : null,
      source ? `source:${source}` : null,
    ].filter(Boolean);

    return `mock-extracted-text(${hints.join(",") || "generic"}): ${filename}`;
  }
}
