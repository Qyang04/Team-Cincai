import { Injectable } from "@nestjs/common";
import type { ExtractionResult, WorkflowDecision, WorkflowType } from "@finance-ops/shared";

export type IntakeArtifactEvidence = {
  id: string;
  filename: string;
  mimeType?: string | null;
  source?: string | null;
  extractedText?: string | null;
  processingStatus: string;
  checksum?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type IntakeArtifacts = {
  workflowType?: WorkflowType;
  notes?: string;
  artifacts?: IntakeArtifactEvidence[];
};

function collectEvidenceChunks(input: IntakeArtifacts) {
  const chunks: Array<{ text: string; source: string }> = [];
  if (input.notes?.trim()) {
    chunks.push({ text: input.notes.trim(), source: "notes" });
  }
  for (const artifact of input.artifacts ?? []) {
    if (artifact.extractedText?.trim()) {
      const extractionMethod =
        typeof artifact.metadata?.extractionMethod === "string" ? artifact.metadata.extractionMethod : "artifact";
      chunks.push({
        text: artifact.extractedText.trim(),
        source: `artifact:${artifact.id}:${extractionMethod.toLowerCase()}`,
      });
    }
  }
  return chunks;
}

function firstMatch(
  chunks: Array<{ text: string; source: string }>,
  pattern: RegExp,
  mapper: (match: RegExpMatchArray) => string | number | undefined,
) {
  for (const chunk of chunks) {
    const match = chunk.text.match(pattern);
    if (match) {
      return {
        value: mapper(match),
        source: chunk.source,
      };
    }
  }
  return null;
}

@Injectable()
export class MockAiProviderService {
  async analyzeIntake(input: IntakeArtifacts): Promise<{
    extraction: ExtractionResult;
    decision: WorkflowDecision;
  }> {
    const inferredWorkflowType = input.workflowType ?? "EXPENSE_CLAIM";
    const evidenceChunks = collectEvidenceChunks(input);
    const amountMatch = firstMatch(evidenceChunks, /\b(\d+(?:\.\d{1,2})?)\b/, (match) => Number(match[1]));
    const projectCodeMatch = firstMatch(evidenceChunks, /\b([A-Z]{2,}-\d{2,})\b/, (match) => match[1]);
    const invoiceMatch = firstMatch(evidenceChunks, /\bINV[-\s]?(\d{3,})\b/i, (match) => `INV-${match[1]}`);
    const merchantMatch = firstMatch(
      evidenceChunks,
      /\b(?:merchant|vendor|store)[:\s]+([A-Z0-9][A-Z0-9 .,&'-]{2,})/i,
      (match) => match[1]?.trim(),
    );
    const amount = typeof amountMatch?.value === "number" ? amountMatch.value : undefined;
    const projectCode = typeof projectCodeMatch?.value === "string" ? projectCodeMatch.value : undefined;
    const invoiceNumber = typeof invoiceMatch?.value === "string" ? invoiceMatch.value : undefined;
    const merchant = typeof merchantMatch?.value === "string" ? merchantMatch.value : undefined;

    return {
      extraction: {
        fields: {
          purpose: input.notes ?? evidenceChunks[0]?.text ?? "Pending clarification",
          amount,
          currency: amount ? "MYR" : undefined,
          projectCode,
          invoiceNumber,
          merchant,
        },
        confidence: 0.72,
        provenance: {
          purpose: input.notes?.trim() ? "notes" : evidenceChunks[0]?.source ?? "notes",
          ...(amountMatch?.source && amount ? { amount: amountMatch.source } : {}),
          ...(projectCodeMatch?.source && projectCode ? { projectCode: projectCodeMatch.source } : {}),
          ...(invoiceMatch?.source && invoiceNumber ? { invoiceNumber: invoiceMatch.source } : {}),
          ...(merchantMatch?.source && merchant ? { merchant: merchantMatch.source } : {}),
        },
        openQuestions: projectCode ? [] : ["What is the project code for this request?"],
        modelMetadata: {
          provider: "mock-ai",
          artifactCount: input.artifacts?.length ?? 0,
          evidenceSources: evidenceChunks.map((chunk) => chunk.source),
        },
      },
      decision: {
        recommendedAction: projectCode ? "advance_to_policy_review" : "request_clarification",
        reasoningSummary: `Initial ${inferredWorkflowType} intake processed with mock GLM gateway.`,
        nextState: projectCode ? "POLICY_REVIEW" : "AWAITING_REQUESTER_INFO",
        requiredApproverRole: "APPROVER",
      },
    };
  }
}
