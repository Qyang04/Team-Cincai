import { Injectable } from "@nestjs/common";
import type { ExtractionResult, WorkflowDecision, WorkflowType } from "@finance-ops/shared";

export type IntakeArtifacts = {
  workflowType?: WorkflowType;
  notes?: string;
  filenames?: string[];
};

@Injectable()
export class MockAiProviderService {
  async analyzeIntake(input: IntakeArtifacts): Promise<{
    extraction: ExtractionResult;
    decision: WorkflowDecision;
  }> {
    const inferredWorkflowType = input.workflowType ?? "EXPENSE_CLAIM";
    const amountMatch = input.notes?.match(/(\d+(?:\.\d{1,2})?)/);
    const projectCodeMatch = input.notes?.match(/\b([A-Z]{2,}-\d{2,})\b/);
    const invoiceMatch = input.notes?.match(/\bINV[-\s]?(\d{3,})\b/i);
    const amount = amountMatch ? Number(amountMatch[1]) : undefined;

    return {
      extraction: {
        fields: {
          purpose: input.notes ?? "Pending clarification",
          amount,
          currency: amount ? "MYR" : undefined,
          projectCode: projectCodeMatch?.[1],
          invoiceNumber: invoiceMatch ? `INV-${invoiceMatch[1]}` : undefined,
        },
        confidence: 0.72,
        provenance: {
          purpose: "notes",
          ...(amount ? { amount: "notes" } : {}),
          ...(projectCodeMatch ? { projectCode: "notes" } : {}),
          ...(invoiceMatch ? { invoiceNumber: "notes" } : {}),
        },
        openQuestions: projectCodeMatch ? [] : ["What is the project code for this request?"],
      },
      decision: {
        recommendedAction: projectCodeMatch ? "advance_to_policy_review" : "request_clarification",
        reasoningSummary: `Initial ${inferredWorkflowType} intake processed with mock GLM gateway.`,
        nextState: projectCodeMatch ? "POLICY_REVIEW" : "AWAITING_REQUESTER_INFO",
        requiredApproverRole: "APPROVER",
      },
    };
  }
}

