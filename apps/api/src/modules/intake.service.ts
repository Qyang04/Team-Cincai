import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { ExtractionResult } from "@finance-ops/shared";
import { PrismaService } from "./prisma.service";

@Injectable()
export class IntakeService {
  constructor(private readonly prisma: PrismaService) {}

  async persistIntakeResult(caseId: string, extraction: ExtractionResult) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.extractionResult.create({
        data: {
          caseId,
          fieldsJson: extraction.fields as Prisma.InputJsonValue,
          confidence: extraction.confidence,
          provenance: extraction.provenance as Prisma.InputJsonValue,
        },
      });

      await tx.openQuestion.deleteMany({
        where: {
          caseId,
          source: "AI_INTAKE",
          status: "OPEN",
        },
      });

      if (extraction.openQuestions.length) {
        await tx.openQuestion.createMany({
          data: extraction.openQuestions.map((question) => ({
            caseId,
            question,
            source: "AI_INTAKE",
          })),
        });
      }
    });
  }

  async listQuestions(caseId: string) {
    return this.prisma.openQuestion.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
    });
  }

  async answerQuestion(caseId: string, questionId: string, answer: string) {
    const updatedQuestion = await this.prisma.openQuestion.update({
      where: { id: questionId },
      data: {
        answer,
        status: "ANSWERED",
      },
    });

    const latestExtraction = await this.prisma.extractionResult.findFirst({
      where: { caseId },
      orderBy: { createdAt: "desc" },
    });

    if (latestExtraction) {
      const fields = (latestExtraction.fieldsJson as Record<string, unknown>) ?? {};
      const provenance = (latestExtraction.provenance as Record<string, unknown>) ?? {};
      const lowerQuestion = updatedQuestion.question.toLowerCase();

      if (lowerQuestion.includes("project code")) {
        fields.projectCode = answer;
        provenance.projectCode = updatedQuestion.source;
      }
      if (lowerQuestion.includes("invoice number")) {
        fields.invoiceNumber = answer;
        provenance.invoiceNumber = updatedQuestion.source;
      }

      await this.prisma.extractionResult.update({
        where: { id: latestExtraction.id },
        data: {
          fieldsJson: fields as Prisma.InputJsonValue,
          provenance: provenance as Prisma.InputJsonValue,
        },
      });
    }

    return updatedQuestion;
  }

  async createQuestion(caseId: string, question: string, source: string) {
    return this.prisma.openQuestion.create({
      data: {
        caseId,
        question,
        source,
      },
    });
  }

  async getLatestExtraction(caseId: string) {
    return this.prisma.extractionResult.findFirst({
      where: { caseId },
      orderBy: { createdAt: "desc" },
    });
  }
}
