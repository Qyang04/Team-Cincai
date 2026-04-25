import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";

function detectArtifactSource(storageUri?: string): string {
  if (!storageUri) {
    return "MANUAL";
  }
  if (storageUri.startsWith("local://")) {
    return "UPLOAD";
  }
  // Legacy: `mock://` artifacts are no longer created by submit; this branch only classifies
  // pre-existing rows so old demo cases still render in the case detail UI.
  if (storageUri.startsWith("mock://")) {
    return "MOCK";
  }
  return "REMOTE";
}

@Injectable()
export class ArtifactsService {
  constructor(private readonly prisma: PrismaService) {}

  async createUploadedPlaceholder(
    caseId: string,
    input: { filename: string; mimeType?: string; storageUri: string },
  ) {
    return this.prisma.artifact.create({
      data: {
        caseId,
        filename: input.filename,
        mimeType: input.mimeType,
        storageUri: input.storageUri,
        source: detectArtifactSource(input.storageUri),
        processingStatus: "PREPARED",
      },
    });
  }

  async attachMany(
    caseId: string,
    filenames: string[],
    defaults?: { mimeType?: string; storagePrefix?: string; processingStatus?: string },
  ) {
    if (!filenames.length) {
      return [];
    }

    return this.prisma.$transaction(
      filenames.map((filename) =>
        this.prisma.artifact.create({
          data: {
            caseId,
            filename,
            mimeType: defaults?.mimeType,
            storageUri: defaults?.storagePrefix ? `${defaults.storagePrefix}/${filename}` : undefined,
            source: detectArtifactSource(defaults?.storagePrefix ? `${defaults.storagePrefix}/${filename}` : undefined),
            processingStatus: defaults?.processingStatus ?? "PREPARED",
          },
        }),
      ),
    );
  }

  async listForCase(caseId: string) {
    return this.prisma.artifact.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
    });
  }

  getArtifact(artifactId: string) {
    return this.prisma.artifact.findUnique({
      where: { id: artifactId },
    });
  }

  async markUploaded(artifactId: string, storageUri?: string) {
    const data = {
      storageUri: storageUri ?? undefined,
      source: detectArtifactSource(storageUri),
      processingStatus: "UPLOADED",
      uploadedAt: new Date(),
      errorMessage: null,
    };

    return this.prisma.artifact.update({
      where: { id: artifactId },
      data,
    });
  }

  async markProcessing(artifactId: string) {
    const data = {
      processingStatus: "PROCESSING",
      processingStartedAt: new Date(),
      errorMessage: null,
    };

    return this.prisma.artifact.update({
      where: { id: artifactId },
      data,
    });
  }

  async markProcessed(
    artifactId: string,
    input: {
      extractedText: string;
      checksum?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    const data = {
      processingStatus: "PROCESSED",
      extractedText: input.extractedText,
      checksum: input.checksum ?? null,
      metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      processingCompletedAt: new Date(),
      errorMessage: null,
    };

    return this.prisma.artifact.update({
      where: { id: artifactId },
      data,
    });
  }

  async markFailed(artifactId: string, errorMessage: string) {
    const data = {
      processingStatus: "FAILED",
      processingCompletedAt: new Date(),
      errorMessage,
    };

    return this.prisma.artifact.update({
      where: { id: artifactId },
      data,
    });
  }
}
