import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
import {
  extractionResultSchema,
  workflowDecisionSchema,
  type CaseStatus,
  type ExtractionResult,
  type WorkflowDecision,
} from "@finance-ops/shared";
import type { IntakeArtifacts } from "./mock-ai-provider.service";

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function normalizeDecisionNextState(
  rawDecision: Record<string, unknown>,
  extraction: ExtractionResult,
): CaseStatus {
  const candidate =
    rawDecision.nextState ??
    rawDecision.next_state ??
    rawDecision.nextStep ??
    rawDecision.next_step ??
    rawDecision.state;

  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim().toUpperCase().replace(/[\s-]+/g, "_") as CaseStatus;
  }

  return extraction.openQuestions.length > 0 ? "AWAITING_REQUESTER_INFO" : "POLICY_REVIEW";
}

function normalizeParsedResult(rawParsed: Record<string, unknown>): {
  extraction: ExtractionResult;
  decision: WorkflowDecision;
} {
  const rawExtraction =
    rawParsed.extraction && typeof rawParsed.extraction === "object"
      ? (rawParsed.extraction as Record<string, unknown>)
      : {};
  const extraction = extractionResultSchema.parse({
    fields:
      rawExtraction.fields && typeof rawExtraction.fields === "object"
        ? (rawExtraction.fields as Record<string, unknown>)
        : {},
    confidence: typeof rawExtraction.confidence === "number" ? rawExtraction.confidence : 0.6,
    provenance:
      rawExtraction.provenance && typeof rawExtraction.provenance === "object"
        ? (rawExtraction.provenance as Record<string, string>)
        : {},
    openQuestions: Array.isArray(rawExtraction.openQuestions)
      ? rawExtraction.openQuestions.map((value) => String(value))
      : [],
    modelMetadata:
      rawExtraction.modelMetadata && typeof rawExtraction.modelMetadata === "object"
        ? (rawExtraction.modelMetadata as Record<string, unknown>)
        : undefined,
  });

  const rawDecision =
    rawParsed.decision && typeof rawParsed.decision === "object"
      ? (rawParsed.decision as Record<string, unknown>)
      : {};

  return {
    extraction,
    decision: workflowDecisionSchema.parse({
      recommendedAction:
        typeof rawDecision.recommendedAction === "string" && rawDecision.recommendedAction.trim()
          ? rawDecision.recommendedAction
          : extraction.openQuestions.length > 0
            ? "request_clarification"
            : "advance_to_policy_review",
      reasoningSummary:
        typeof rawDecision.reasoningSummary === "string" && rawDecision.reasoningSummary.trim()
          ? rawDecision.reasoningSummary
          : "AI intake completed from notes and artifact evidence.",
      nextState: normalizeDecisionNextState(rawDecision, extraction),
      requiredApproverRole:
        typeof rawDecision.requiredApproverRole === "string" ? rawDecision.requiredApproverRole : undefined,
    }),
  };
}

@Injectable()
export class ZaiAiProviderService {
  private readonly client = process.env.ZAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.ZAI_API_KEY,
        baseURL: process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4",
      })
    : null;

  async analyzeIntake(input: IntakeArtifacts): Promise<{
    extraction: ExtractionResult;
    decision: WorkflowDecision;
  }> {
    if (!this.client) {
      throw new Error("Z.AI client is not configured.");
    }

    const response = await this.client.chat.completions.create({
      model: process.env.ZAI_MODEL_PRIMARY ?? "glm-5.1",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You extract structured finance workflow data from notes plus artifact evidence. Return strict JSON with keys extraction and decision only. extraction must contain fields, confidence, provenance, openQuestions, and optional modelMetadata. If an artifact's extractedText is empty, whitespace-only, or its metadata.extractionWarnings array is non-empty, do NOT invent values for that artifact's fields: add a clarifying entry to openQuestions asking the requester to re-upload a clearer copy or confirm the values, lower the overall confidence, and omit fields you cannot ground in evidence rather than guessing.",
        },
        {
          role: "user",
          content: JSON.stringify({
            workflowType: input.workflowType ?? "EXPENSE_CLAIM",
            notes: input.notes ?? "",
            artifacts: (input.artifacts ?? []).map((artifact) => ({
              id: artifact.id,
              filename: artifact.filename,
              mimeType: artifact.mimeType ?? null,
              source: artifact.source ?? null,
              extractedText: artifact.extractedText ?? "",
              processingStatus: artifact.processingStatus,
              checksum: artifact.checksum ?? null,
              metadata: artifact.metadata ?? null,
            })),
          }),
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("Z.AI returned no content.");
    }

    return normalizeParsedResult(JSON.parse(extractJsonObject(raw)) as Record<string, unknown>);
  }
}
