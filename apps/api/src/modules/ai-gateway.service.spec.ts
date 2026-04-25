import assert from "node:assert/strict";
import test from "node:test";
import { AiGatewayService } from "./ai-gateway.service";
import type { ZaiAiProviderService } from "./zai-ai-provider.service";

test("AiGatewayService returns the Z.AI result on success", async () => {
  const expected = {
    extraction: {
      fields: { purpose: "real" },
      confidence: 0.81,
      provenance: { purpose: "notes" },
      openQuestions: [],
      modelMetadata: { provider: "zai" },
    },
    decision: {
      recommendedAction: "advance_to_policy_review" as const,
      reasoningSummary: "OK.",
      nextState: "POLICY_REVIEW" as const,
      requiredApproverRole: "APPROVER" as const,
    },
  };

  const gateway = new AiGatewayService({
    analyzeIntake: async () => expected,
  } as unknown as ZaiAiProviderService);

  const result = await gateway.analyzeIntake({
    workflowType: "EXPENSE_CLAIM",
    notes: "Taxi receipt",
    artifacts: [],
  });

  assert.deepEqual(result, expected);
});

test("AiGatewayService propagates Z.AI errors (no mock fallback)", async () => {
  const gateway = new AiGatewayService({
    analyzeIntake: async () => {
      const error = new Error("504 status code (no body)") as Error & { status?: number };
      error.status = 504;
      throw error;
    },
  } as unknown as ZaiAiProviderService);

  await assert.rejects(
    gateway.analyzeIntake({
      workflowType: "EXPENSE_CLAIM",
      notes: "Taxi receipt",
      artifacts: [],
    }),
    /504/,
  );
});
