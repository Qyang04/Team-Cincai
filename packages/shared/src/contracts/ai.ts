import type { WorkflowType } from "../domain/workflow";

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
