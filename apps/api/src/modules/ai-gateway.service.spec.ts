import assert from "node:assert/strict";
import test from "node:test";
import { AiGatewayService } from "./ai-gateway.service";
import type { MockAiProviderService } from "./mock-ai-provider.service";
import type { ZaiAiProviderService } from "./zai-ai-provider.service";

test("AiGatewayService falls back to mock AI when the primary provider times out", async () => {
  const mockResult = {
    extraction: {
      fields: { purpose: "fallback" },
      confidence: 0.72,
      provenance: { purpose: "notes" },
      openQuestions: [],
      modelMetadata: {
        provider: "mock-ai",
      },
    },
    decision: {
      recommendedAction: "advance_to_policy_review",
      reasoningSummary: "Mock fallback decision.",
      nextState: "POLICY_REVIEW" as const,
      requiredApproverRole: "APPROVER" as const,
    },
  };

  const gateway = new AiGatewayService(
    {
      analyzeIntake: async () => mockResult,
    } as unknown as MockAiProviderService,
    {
      analyzeIntake: async () => {
        const error = new Error("504 status code (no body)") as Error & { status?: number };
        error.status = 504;
        throw error;
      },
    } as unknown as ZaiAiProviderService,
  );

  const previous = process.env.USE_MOCK_AI;
  const previousFallback = process.env.AI_FALLBACK_TO_MOCK;
  process.env.USE_MOCK_AI = "false";
  process.env.AI_FALLBACK_TO_MOCK = "true";

  try {
    const result = await gateway.analyzeIntake({
      workflowType: "EXPENSE_CLAIM",
      notes: "Taxi receipt",
      artifacts: [],
    });

    assert.equal(result.decision.nextState, "POLICY_REVIEW");
    assert.equal(result.extraction.modelMetadata?.provider, "mock-ai");
    assert.equal(result.extraction.modelMetadata?.fallbackFrom, "zai");
    assert.match(String(result.extraction.modelMetadata?.fallbackReason), /504/i);
  } finally {
    if (previous === undefined) {
      delete process.env.USE_MOCK_AI;
    } else {
      process.env.USE_MOCK_AI = previous;
    }
    if (previousFallback === undefined) {
      delete process.env.AI_FALLBACK_TO_MOCK;
    } else {
      process.env.AI_FALLBACK_TO_MOCK = previousFallback;
    }
  }
});
