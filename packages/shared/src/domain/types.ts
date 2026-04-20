import type { ActorType, CaseStatus, RoleType, WorkflowType } from "./workflow";

export type StructuredFields = {
  amount?: number;
  currency?: string;
  merchant?: string;
  invoiceNumber?: string;
  spendDate?: string;
  purpose?: string;
  costCenter?: string;
  vendorName?: string;
  projectCode?: string;
};

export type ExtractionResult = {
  fields: StructuredFields;
  confidence: number;
  provenance: Record<string, string>;
  openQuestions: string[];
};

export type PolicyCheckResult = {
  passed: boolean;
  warnings: string[];
  blockingIssues: string[];
  requiresFinanceReview: boolean;
  duplicateSignals: string[];
};

export type WorkflowDecision = {
  recommendedAction: string;
  reasoningSummary: string;
  nextState: CaseStatus;
  requiredApproverRole?: RoleType;
};

export type CaseRecord = {
  id: string;
  workflowType: WorkflowType;
  status: CaseStatus;
  requesterId: string;
  assignedTo?: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  createdAt: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  caseId: string;
  eventType: string;
  actorType: ActorType;
  actorId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
};

