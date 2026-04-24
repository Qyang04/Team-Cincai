import { z } from "zod";
import { actorTypes, caseStatuses, roleTypes, workflowTypes } from "../domain/workflow";

const isoDateTimeStringSchema = z.string().datetime({ offset: true });
const nullableStringSchema = z.string().nullable();
const nullableIsoDateTimeStringSchema = isoDateTimeStringSchema.nullable();
const caseFieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const recordOfUnknownSchema = z.record(z.string(), z.unknown());
const recordOfStringsSchema = z.record(z.string(), z.string());
const stringArraySchema = z.array(z.string());

export const casePrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type CasePriority = z.infer<typeof casePrioritySchema>;

export const artifactTypeSchema = z.enum(["RECEIPT", "INVOICE", "SCREENSHOT", "NOTE", "OTHER"]);
export type ArtifactType = z.infer<typeof artifactTypeSchema>;

export const structuredFieldsViewSchema = z.object({
  amount: z.number().optional(),
  currency: z.string().optional(),
  merchant: z.string().optional(),
  invoiceNumber: z.string().optional(),
  spendDate: z.string().optional(),
  purpose: z.string().optional(),
  costCenter: z.string().optional(),
  vendorName: z.string().optional(),
  projectCode: z.string().optional(),
  originalAmount: z.number().optional(),
  originalCurrency: z.string().optional(),
  baseCurrency: z.string().optional(),
  estimatedFxRate: z.number().optional(),
  estimatedBaseAmount: z.number().optional(),
  realizedBaseAmount: z.number().optional(),
  realizedFxSource: z.string().optional(),
  netAmount: z.number().optional(),
  taxAmount: z.number().optional(),
  grossAmount: z.number().optional(),
  vendorTaxId: z.string().optional(),
  amountDiscrepancyFlag: z.boolean().optional(),
  taxMismatchFlag: z.boolean().optional(),
});
export type StructuredFieldsView = z.infer<typeof structuredFieldsViewSchema>;

export const caseSummarySchema = z.object({
  id: z.string().min(1),
  workflowType: z.enum(workflowTypes),
  status: z.enum(caseStatuses),
  requesterId: z.string().min(1),
  assignedTo: nullableStringSchema.optional(),
  priority: casePrioritySchema,
  createdAt: isoDateTimeStringSchema,
  updatedAt: isoDateTimeStringSchema,
});
export type CaseSummary = z.infer<typeof caseSummarySchema>;

export const caseStatusSnapshotSchema = caseSummarySchema.pick({
  id: true,
  status: true,
});
export type CaseStatusSnapshot = z.infer<typeof caseStatusSnapshotSchema>;

export const caseArtifactSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  type: artifactTypeSchema,
  filename: z.string().min(1),
  mimeType: nullableStringSchema.optional(),
  storageUri: nullableStringSchema.optional(),
  extractedText: nullableStringSchema.optional(),
  processingStatus: z.string().min(1),
  errorMessage: nullableStringSchema.optional(),
  uploadedAt: nullableIsoDateTimeStringSchema.optional(),
  processingStartedAt: nullableIsoDateTimeStringSchema.optional(),
  processingCompletedAt: nullableIsoDateTimeStringSchema.optional(),
  createdAt: isoDateTimeStringSchema,
  updatedAt: isoDateTimeStringSchema,
});
export type CaseArtifact = z.infer<typeof caseArtifactSchema>;

export const artifactProcessingSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  prepared: z.number().int().nonnegative(),
  uploaded: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  processed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  latestStatus: nullableStringSchema.optional(),
  allProcessed: z.boolean(),
  hasFailures: z.boolean(),
  summary: z.string().min(1),
});
export type ArtifactProcessingSummary = z.infer<typeof artifactProcessingSummarySchema>;

export const caseExtractionResultSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  fieldsJson: z.record(z.string(), caseFieldValueSchema),
  confidence: z.number(),
  provenance: recordOfStringsSchema.nullable().optional(),
  createdAt: isoDateTimeStringSchema,
});
export type CaseExtractionResult = z.infer<typeof caseExtractionResultSchema>;

export const caseOpenQuestionSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  question: z.string().min(1),
  answer: nullableStringSchema.optional(),
  status: z.string().min(1),
  source: z.string().min(1).optional(),
  createdAt: isoDateTimeStringSchema,
  updatedAt: isoDateTimeStringSchema,
});
export type CaseOpenQuestion = z.infer<typeof caseOpenQuestionSchema>;

export const caseAnsweredQuestionSchema = caseOpenQuestionSchema.pick({
  id: true,
  caseId: true,
  question: true,
  answer: true,
  status: true,
  source: true,
});
export type CaseAnsweredQuestion = z.infer<typeof caseAnsweredQuestionSchema>;

export const casePolicyResultSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  passed: z.boolean(),
  warnings: stringArraySchema,
  blockingIssues: stringArraySchema,
  requiresFinanceReview: z.boolean(),
  duplicateSignals: stringArraySchema,
  reconciliationFlags: stringArraySchema.optional(),
  approvalRequirement: z.string().nullable().optional(),
  createdAt: isoDateTimeStringSchema,
});
export type CasePolicyResult = z.infer<typeof casePolicyResultSchema>;

export const casePolicyResultSummarySchema = casePolicyResultSchema.pick({
  passed: true,
  warnings: true,
  blockingIssues: true,
  requiresFinanceReview: true,
  duplicateSignals: true,
  reconciliationFlags: true,
  approvalRequirement: true,
});
export type CasePolicyResultSummary = z.infer<typeof casePolicyResultSummarySchema>;

export const caseApprovalTaskSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  approverId: z.string().min(1),
  stageNumber: z.number().int().positive().optional(),
  stageMode: z.string().min(1).optional(),
  stageLabel: nullableStringSchema.optional(),
  stageDependencyType: z.string().min(1).optional(),
  stageRequiredApprovals: z.number().int().positive().optional(),
  stageSlaHours: z.number().int().positive().nullable().optional(),
  stageDueAt: nullableIsoDateTimeStringSchema.optional(),
  stageEscalatesTo: nullableStringSchema.optional(),
  stageEscalatedAt: nullableIsoDateTimeStringSchema.optional(),
  delegatedFrom: nullableStringSchema.optional(),
  actingApproverId: nullableStringSchema.optional(),
  status: z.string().min(1),
  decision: nullableStringSchema.optional(),
  decisionReason: nullableStringSchema.optional(),
  dueAt: nullableIsoDateTimeStringSchema.optional(),
  createdAt: isoDateTimeStringSchema,
  updatedAt: isoDateTimeStringSchema,
});
export type CaseApprovalTask = z.infer<typeof caseApprovalTaskSchema>;

export const caseFinanceReviewItemSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  reviewerId: nullableStringSchema.optional(),
  ownerId: nullableStringSchema.optional(),
  outcome: nullableStringSchema.optional(),
  reasonCategory: nullableStringSchema.optional(),
  codingDecision: nullableStringSchema.optional(),
  reconciliationStatus: nullableStringSchema.optional(),
  reconciledAmount: z.number().nullable().optional(),
  reconciledCurrency: nullableStringSchema.optional(),
  annotation: nullableStringSchema.optional(),
  note: nullableStringSchema.optional(),
  createdAt: isoDateTimeStringSchema,
  updatedAt: isoDateTimeStringSchema,
});
export type CaseFinanceReviewItem = z.infer<typeof caseFinanceReviewItemSchema>;

export const caseFinanceReviewResolutionSchema = caseFinanceReviewItemSchema.pick({
  id: true,
  caseId: true,
  reviewerId: true,
  ownerId: true,
  outcome: true,
  reasonCategory: true,
  codingDecision: true,
  reconciliationStatus: true,
  reconciledAmount: true,
  reconciledCurrency: true,
  annotation: true,
  note: true,
});
export type CaseFinanceReviewResolution = z.infer<typeof caseFinanceReviewResolutionSchema>;

export const caseExportRecordSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  status: z.string().min(1),
  connectorName: z.string().min(1).optional(),
  errorMessage: nullableStringSchema.optional(),
  createdAt: isoDateTimeStringSchema,
  updatedAt: isoDateTimeStringSchema,
});
export type CaseExportRecord = z.infer<typeof caseExportRecordSchema>;

export const caseExportRecordSnapshotSchema = caseExportRecordSchema.pick({
  id: true,
  caseId: true,
  status: true,
  connectorName: true,
  errorMessage: true,
});
export type CaseExportRecordSnapshot = z.infer<typeof caseExportRecordSnapshotSchema>;

export const caseWorkflowTransitionSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  fromStatus: z.enum(caseStatuses),
  toStatus: z.enum(caseStatuses),
  actorType: z.enum(actorTypes),
  actorId: nullableStringSchema.optional(),
  note: nullableStringSchema.optional(),
  createdAt: isoDateTimeStringSchema,
});
export type CaseWorkflowTransition = z.infer<typeof caseWorkflowTransitionSchema>;

export const caseAuditEventSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  eventType: z.string().min(1),
  actorType: z.enum(actorTypes),
  actorId: nullableStringSchema.optional(),
  payload: recordOfUnknownSchema,
  createdAt: isoDateTimeStringSchema,
});
export type CaseAuditEvent = z.infer<typeof caseAuditEventSchema>;

export const caseTimelineItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  at: isoDateTimeStringSchema,
  kind: z.enum(["transition", "audit"]),
});
export type CaseTimelineItem = z.infer<typeof caseTimelineItemSchema>;

export const exportReadinessSummarySchema = z.object({
  ready: z.boolean(),
  status: z.string().min(1),
  summary: z.string().min(1),
});
export type ExportReadinessSummary = z.infer<typeof exportReadinessSummarySchema>;

export const caseListItemSchema = caseSummarySchema.extend({
  stage: z.enum(caseStatuses).optional(),
  manualActionRequired: z.boolean().optional(),
  recommendedAction: nullableStringSchema.optional(),
  needsMyAction: z.boolean().optional(),
  artifactSummary: artifactProcessingSummarySchema.optional(),
  artifacts: z
    .array(
      caseArtifactSchema.pick({
        id: true,
      }),
    )
    .optional(),
});
export type CaseListItem = z.infer<typeof caseListItemSchema>;

export const caseListResponseSchema = z.array(caseListItemSchema);
export type CaseListResponse = z.infer<typeof caseListResponseSchema>;

export const caseDetailResponseSchema = caseSummarySchema.extend({
  stage: z.enum(caseStatuses),
  manualActionRequired: z.boolean(),
  artifactSummary: artifactProcessingSummarySchema,
  latestExtraction: caseExtractionResultSchema.nullable(),
  latestPolicyResult: casePolicyResultSchema.nullable(),
  latestApprovalTask: caseApprovalTaskSchema.nullable(),
  latestFinanceReview: caseFinanceReviewItemSchema.nullable(),
  latestExportRecord: caseExportRecordSchema.nullable(),
  reasoningSummary: z.string().nullable(),
  recommendedAction: z.string().nullable(),
  failureMode: z.string().nullable(),
  exportReadinessSummary: exportReadinessSummarySchema,
  artifacts: z.array(caseArtifactSchema),
  extractionResults: z.array(caseExtractionResultSchema),
  openQuestions: z.array(caseOpenQuestionSchema),
  policyResults: z.array(casePolicyResultSchema),
  approvalTasks: z.array(caseApprovalTaskSchema),
  financeReviews: z.array(caseFinanceReviewItemSchema),
  exportRecords: z.array(caseExportRecordSchema),
  workflowTransitions: z.array(caseWorkflowTransitionSchema),
  auditEvents: z.array(caseAuditEventSchema),
});
export type CaseDetailResponse = z.infer<typeof caseDetailResponseSchema>;

export const approvalQueueItemSchema = caseApprovalTaskSchema.extend({
  case: caseSummarySchema.pick({
    id: true,
    workflowType: true,
    status: true,
    priority: true,
    requesterId: true,
    createdAt: true,
    updatedAt: true,
  }),
});
export const approvalQueueResponseSchema = z.array(approvalQueueItemSchema);
export type ApprovalQueueItem = z.infer<typeof approvalQueueItemSchema>;

export const approvalAnalyticsSummarySchema = z.object({
  pendingTasks: z.number().int().nonnegative(),
  blockedTasks: z.number().int().nonnegative(),
  approvedLast7d: z.number().int().nonnegative(),
  rejectedLast7d: z.number().int().nonnegative(),
  delegatedOpenTasks: z.number().int().nonnegative(),
  escalatedStages: z.number().int().nonnegative(),
  overdueActiveStages: z.number().int().nonnegative(),
  avgApprovalHours: z.number().nullable(),
  bottleneckStage: z
    .object({
      stageNumber: z.number().int().positive(),
      pendingCount: z.number().int().nonnegative(),
    })
    .nullable(),
});
export type ApprovalAnalyticsSummary = z.infer<typeof approvalAnalyticsSummarySchema>;

export const approvalSlaSweepResponseSchema = z.object({
  escalatedStages: z.number().int().nonnegative(),
  escalatedTasks: z.number().int().nonnegative(),
  reminderCandidates: z.number().int().nonnegative(),
});
export type ApprovalSlaSweepResponse = z.infer<typeof approvalSlaSweepResponseSchema>;

export const financeReviewAnalyticsSummarySchema = z.object({
  openReviews: z.number().int().nonnegative(),
  sentBackOpenReviews: z.number().int().nonnegative(),
  approvedLast7d: z.number().int().nonnegative(),
  rejectedLast7d: z.number().int().nonnegative(),
  unassignedOpenReviews: z.number().int().nonnegative(),
  avgResolutionHours: z.number().nullable(),
});
export type FinanceReviewAnalyticsSummary = z.infer<typeof financeReviewAnalyticsSummarySchema>;

export const financeReviewQueueItemSchema = caseFinanceReviewItemSchema.extend({
  case: caseSummarySchema.pick({
    id: true,
    workflowType: true,
    status: true,
    priority: true,
    requesterId: true,
    createdAt: true,
    updatedAt: true,
  }),
});
export const financeReviewQueueResponseSchema = z.array(financeReviewQueueItemSchema);
export type FinanceReviewQueueItem = z.infer<typeof financeReviewQueueItemSchema>;

const actionErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
});
export type ActionErrorResponse = z.infer<typeof actionErrorResponseSchema>;

function createActionResponseSchema<TData extends z.ZodTypeAny>(dataSchema: TData) {
  return z.discriminatedUnion("success", [
    z.object({
      success: z.literal(true),
      data: dataSchema,
    }),
    actionErrorResponseSchema,
  ]);
}

export const questionResponseActionResponseSchema = createActionResponseSchema(
  z.object({
    question: caseAnsweredQuestionSchema,
  }),
);
export type QuestionResponseActionResponse = z.infer<typeof questionResponseActionResponseSchema>;

export const approvalActionResponseSchema = createActionResponseSchema(
  z.object({
    case: caseStatusSnapshotSchema,
    exportRecord: caseExportRecordSnapshotSchema.nullable().optional(),
  }),
);
export type ApprovalActionResponse = z.infer<typeof approvalActionResponseSchema>;

export const financeReviewActionResponseSchema = createActionResponseSchema(
  z.object({
    review: caseFinanceReviewResolutionSchema,
    case: caseStatusSnapshotSchema,
    exportRecord: caseExportRecordSnapshotSchema.nullable().optional(),
  }),
);
export type FinanceReviewActionResponse = z.infer<typeof financeReviewActionResponseSchema>;

export const exportActionResponseSchema = createActionResponseSchema(
  z.object({
    case: caseStatusSnapshotSchema,
    exportRecord: caseExportRecordSnapshotSchema,
  }),
);
export type ExportActionResponse = z.infer<typeof exportActionResponseSchema>;

export const recoverActionResponseSchema = createActionResponseSchema(
  z.object({
    case: caseStatusSnapshotSchema,
    policyResult: casePolicyResultSummarySchema.nullable(),
  }),
);
export type RecoverActionResponse = z.infer<typeof recoverActionResponseSchema>;

export const workflowDecisionViewSchema = z.object({
  recommendedAction: z.string().min(1),
  reasoningSummary: z.string().min(1),
  nextState: z.enum(caseStatuses),
  requiredApproverRole: z.enum(roleTypes).optional(),
});
export type WorkflowDecisionView = z.infer<typeof workflowDecisionViewSchema>;

export const aiExtractionViewSchema = z.object({
  fields: structuredFieldsViewSchema,
  confidence: z.number(),
  provenance: recordOfStringsSchema,
  openQuestions: stringArraySchema,
});
export type AiExtractionView = z.infer<typeof aiExtractionViewSchema>;

export const caseSubmissionResponseSchema = z.object({
  case: caseSummarySchema,
  aiResult: z.object({
    extraction: aiExtractionViewSchema,
    decision: workflowDecisionViewSchema,
  }),
  policyResult: casePolicyResultSummarySchema.nullable(),
});
export type CaseSubmissionResponse = z.infer<typeof caseSubmissionResponseSchema>;

export const createCaseResponseSchema = caseSummarySchema;
export type CreateCaseResponse = z.infer<typeof createCaseResponseSchema>;
