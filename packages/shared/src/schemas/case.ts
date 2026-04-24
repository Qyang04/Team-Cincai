import { z } from "zod";
import { caseStatuses, roleTypes, workflowTypes } from "../domain/workflow";

export const createCaseSchema = z.object({
  workflowType: z.enum(workflowTypes),
  requesterId: z.string().min(1),
});

export const submitCaseSchema = z.object({
  notes: z.string().max(5000).optional(),
  filenames: z.array(z.string()).default([]),
});

export const structuredFieldsSchema = z.object({
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

export const extractionResultSchema = z.object({
  fields: structuredFieldsSchema,
  confidence: z.number(),
  provenance: z.record(z.string(), z.string()),
  openQuestions: z.array(z.string()),
  modelMetadata: z.record(z.string(), z.unknown()).optional(),
});

export const policyCheckResultSchema = z.object({
  passed: z.boolean(),
  warnings: z.array(z.string()),
  blockingIssues: z.array(z.string()),
  requiresFinanceReview: z.boolean(),
  duplicateSignals: z.array(z.string()),
  reconciliationFlags: z.array(z.string()).optional(),
  approvalRequirement: z.string().nullable().optional(),
});

export const workflowDecisionSchema = z.object({
  recommendedAction: z.string().min(1),
  reasoningSummary: z.string().min(1),
  nextState: z.enum(caseStatuses),
  requiredApproverRole: z.enum(roleTypes).optional(),
});
