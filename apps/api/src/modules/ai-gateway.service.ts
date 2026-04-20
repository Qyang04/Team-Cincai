import { Injectable } from "@nestjs/common";
import type { ExtractionResult, WorkflowDecision } from "@finance-ops/shared";
import { MockAiProviderService, type IntakeArtifacts } from "./mock-ai-provider.service";
import { ZaiAiProviderService } from "./zai-ai-provider.service";

@Injectable()
export class AiGatewayService {
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

    return this.zaiProvider.analyzeIntake(input);
  }
}

