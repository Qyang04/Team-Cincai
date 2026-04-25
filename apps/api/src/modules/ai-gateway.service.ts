import { Injectable, Logger } from "@nestjs/common";
import type { ExtractionResult, IntakeArtifacts, WorkflowDecision } from "@finance-ops/shared";
import { ZaiAiProviderService } from "./zai-ai-provider.service";

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(private readonly zaiProvider: ZaiAiProviderService) {}

  async analyzeIntake(input: IntakeArtifacts): Promise<{
    extraction: ExtractionResult;
    decision: WorkflowDecision;
  }> {
    try {
      return await this.zaiProvider.analyzeIntake(input);
    } catch (error) {
      this.logger.error(
        `Z.AI intake analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error;
    }
  }
}
