import { z } from "zod";

export const attachArtifactsSchema = z.object({
  filenames: z.array(z.string()).min(1),
  mimeType: z.string().optional(),
});

export const answerQuestionSchema = z.object({
  answer: z.string().min(1).max(2000),
});

export const approvalDecisionSchema = z.object({
  approverId: z.string().min(1),
  decisionReason: z.string().max(2000).optional(),
});

export const requestInfoSchema = z.object({
  approverId: z.string().min(1),
  question: z.string().min(1).max(2000),
});

export const delegateApprovalSchema = z.object({
  delegateTo: z.string().min(1),
  reason: z.string().max(2000).optional(),
});

export const financeDecisionSchema = z.object({
  reviewerId: z.string().min(1),
  ownerId: z.string().min(1).optional(),
  reasonCategory: z
    .enum(["POLICY_BLOCK", "RECONCILIATION", "CODING", "RISK", "MISSING_SUPPORT", "OTHER"])
    .optional(),
  codingDecision: z.enum(["APPROVE_AS_IS", "RECLASSIFY", "SPLIT", "HOLD"]).optional(),
  reconciliationStatus: z.enum(["MATCHED", "ADJUSTED", "UNRESOLVED"]).optional(),
  reconciledAmount: z.number().nonnegative().optional(),
  reconciledCurrency: z.string().max(16).optional(),
  annotation: z.string().max(2000).optional(),
  note: z.string().max(2000).optional(),
});

export const financeAssignSchema = z.object({
  ownerId: z.string().min(1),
});

export const prepareUploadSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().optional(),
  type: z.enum(["RECEIPT", "INVOICE", "SCREENSHOT", "NOTE", "OTHER"]).optional(),
});

export const completeArtifactUploadSchema = z.object({
  storageUri: z.string().min(1).optional(),
});

export const processArtifactSchema = z.object({
  artifactId: z.string().min(1),
});
