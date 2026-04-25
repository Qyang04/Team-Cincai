import { Injectable, Logger } from "@nestjs/common";
import type { ExtractionResult, WorkflowDecision } from "@finance-ops/shared";
import { MockAiProviderService, type IntakeArtifacts } from "./mock-ai-provider.service";
import { ZaiAiProviderService } from "./zai-ai-provider.service";

function shouldFallbackToMock(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithStatus = error as Error & { status?: unknown };
  const status = typeof errorWithStatus.status === "number" ? errorWithStatus.status : null;
  if (status !== null && status >= 500) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("zoderror") ||
    message.includes("expected number") ||
    message.includes("expected string") ||
    message.includes("expected object")
  );
}

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    private readonly mockProvider: MockAiProviderService,
    private readonly zaiProvider: ZaiAiProviderService,
  ) {}

  async analyzeIntake(input: IntakeArtifacts): Promise<{
    extraction: ExtractionResult;
    decision: WorkflowDecision;
  }> {
    const useMockAi = (process.env.USE_MOCK_AI ?? "true").toLowerCase() !== "false";

    if (useMockAi) {
      return this.mockProvider.analyzeIntake(input);
    }

    try {
      return await this.zaiProvider.analyzeIntake(input);
    } catch (error) {
      const fallbackEnabled = (process.env.AI_FALLBACK_TO_MOCK ?? "false").toLowerCase() !== "false";
      if (!fallbackEnabled || !shouldFallbackToMock(error)) {
        throw error;
      }

      this.logger.warn(
        `Primary AI provider failed during intake analysis; falling back to mock AI. ${error instanceof Error ? error.message : "Unknown error"}`,
      );

      const fallback = await this.mockProvider.analyzeIntake(input);
      return {
        extraction: {
          ...fallback.extraction,
          modelMetadata: {
            ...(fallback.extraction.modelMetadata ?? {}),
            provider: "mock-ai",
            fallbackFrom: "zai",
            fallbackReason: error instanceof Error ? error.message : "Unknown provider error",
          },
        },
        decision: fallback.decision,
      };
    }
  }
}
