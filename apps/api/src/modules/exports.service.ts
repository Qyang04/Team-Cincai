import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureExportReady(caseId: string) {
    const existing = await this.prisma.exportRecord.findFirst({
      where: { caseId },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return existing;
    }

    const caseRecord = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: { extractionResults: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    return this.prisma.exportRecord.create({
      data: {
        caseId,
        status: "READY",
        payload: {
          caseId,
          workflowType: caseRecord?.workflowType ?? "UNKNOWN",
          extracted: caseRecord?.extractionResults[0]?.fieldsJson ?? {},
        } as Prisma.InputJsonValue,
      },
    });
  }

  async getLatest(caseId: string) {
    return this.prisma.exportRecord.findFirst({
      where: { caseId },
      orderBy: { createdAt: "desc" },
    });
  }

  async process(caseId: string) {
    const exportRecord = await this.ensureExportReady(caseId);
    const caseRecord = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: { artifacts: true },
    });

    await this.prisma.exportRecord.update({
      where: { id: exportRecord.id },
      data: { status: "EXPORTING", errorMessage: null },
    });

    const shouldFail = caseRecord?.artifacts.some((artifact: { filename: string }) =>
      artifact.filename.toLowerCase().includes("fail-export"),
    );

    if (shouldFail) {
      return this.prisma.exportRecord.update({
        where: { id: exportRecord.id },
        data: {
          status: "FAILED",
          errorMessage: "Mock export connector failure triggered by artifact filename.",
        },
      });
    }

    return this.prisma.exportRecord.update({
      where: { id: exportRecord.id },
      data: {
        status: "EXPORTED",
      },
    });
  }
}
