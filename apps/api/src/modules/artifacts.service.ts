import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Injectable()
export class ArtifactsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async markProcessed(artifactId: string, extractedText: string) {
    const data = {
      processingStatus: "PROCESSED",
      extractedText,
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
