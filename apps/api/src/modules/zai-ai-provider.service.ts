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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const objectValue = asRecord(value);
  if (objectValue) {
    return (
      asString(objectValue.value) ??
      asString(objectValue.text) ??
      asString(objectValue.label) ??
      asString(objectValue.name) ??
      asString(objectValue.content)
    );
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const stringValue = asString(value);
  if (!stringValue) {
    return undefined;
  }
  const normalized = stringValue.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeFields(rawFields: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawFields)) {
    if (key.toLowerCase().includes("amount") || key.toLowerCase().includes("rate")) {
      const numeric = asNumber(value);
      normalized[key] = numeric ?? asString(value) ?? value;
      continue;
    }
    normalized[key] = asString(value) ?? value;
  }
  return normalized;
}

function normalizeProvenance(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    const parsed = asString(raw);
    if (parsed) {
      normalized[key] = parsed;
    }
  }
  return normalized;
}

function normalizeParsedResult(rawParsed: Record<string, unknown>): {
  extraction: ExtractionResult;
  decision: WorkflowDecision;
} {
  const rawExtraction = asRecord(rawParsed.extraction) ?? {};
  const rawFields = asRecord(rawExtraction.fields) ?? {};
  const extraction = extractionResultSchema.parse({
    fields: normalizeFields(rawFields),
    confidence: typeof rawExtraction.confidence === "number" ? rawExtraction.confidence : 0.6,
    provenance: normalizeProvenance(rawExtraction.provenance),
    openQuestions: Array.isArray(rawExtraction.openQuestions)
      ? rawExtraction.openQuestions.map((value) => String(value))
      : [],
    modelMetadata:
      asRecord(rawExtraction.modelMetadata) ?? undefined,
  });

  const rawDecision = asRecord(rawParsed.decision) ?? {};

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
