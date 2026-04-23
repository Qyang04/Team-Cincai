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

export const financeDecisionSchema = z.object({
  reviewerId: z.string().min(1),
  note: z.string().max(2000).optional(),
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
