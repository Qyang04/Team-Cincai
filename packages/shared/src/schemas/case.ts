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

export const workflowDecisionSchema = z.object({
  recommendedAction: z.string().min(1),
  reasoningSummary: z.string().min(1),
  nextState: z.enum(caseStatuses),
  requiredApproverRole: z.enum(roleTypes).optional(),
});

