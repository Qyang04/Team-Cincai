import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
import type { ExtractionResult, WorkflowDecision } from "@finance-ops/shared";
import type { IntakeArtifacts } from "./mock-ai-provider.service";

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
            "You extract structured finance workflow data. Return strict JSON with keys extraction and decision only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            workflowType: input.workflowType ?? "EXPENSE_CLAIM",
            notes: input.notes ?? "",
            filenames: input.filenames ?? [],
          }),
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("Z.AI returned no content.");
    }

    const parsed = JSON.parse(raw) as {
      extraction: ExtractionResult;
      decision: WorkflowDecision;
    };

    return parsed;
  }
}

