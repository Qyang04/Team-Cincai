import { z } from "zod";
import { workflowTypes, type WorkflowType } from "../domain/workflow";

const workflowTypeSet = new Set<string>(workflowTypes);

export function normalizeWorkflowTypeIdentifier(value: string): string {
  return value.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

function coerceWorkflowTypeIdentifier(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = normalizeWorkflowTypeIdentifier(value);
  if (workflowTypeSet.has(normalized)) {
    return normalized as WorkflowType;
  }

  return value;
}

const workflowTypeIdentifierSchema = z.preprocess(coerceWorkflowTypeIdentifier, z.enum(workflowTypes));

export const adminPolicyConfigSchema = z.object({
  managerApprovalThreshold: z.number().min(0),
  requireProjectCodeWorkflows: z.array(workflowTypeIdentifierSchema),
  duplicateFilenameDetection: z.boolean(),
  duplicateEvidenceDetection: z.boolean(),
  invoiceNumberRequiredForVendorInvoices: z.boolean(),
});
export type AdminPolicyConfig = z.infer<typeof adminPolicyConfigSchema>;
export const adminPolicyConfigUpdateSchema = adminPolicyConfigSchema.partial();
export type AdminPolicyConfigUpdate = z.infer<typeof adminPolicyConfigUpdateSchema>;

export const adminRoutingConfigSchema = z.object({
  defaultApproverId: z.string().min(1),
  financeReviewerId: z.string().min(1),
  escalationWindowHours: z.number().min(1),
});
export type AdminRoutingConfig = z.infer<typeof adminRoutingConfigSchema>;
export const adminRoutingConfigUpdateSchema = adminRoutingConfigSchema.partial();
export type AdminRoutingConfigUpdate = z.infer<typeof adminRoutingConfigUpdateSchema>;

export const adminConnectorStatusSchema = z.object({
  connector: z.string().min(1),
  status: z.string().min(1),
  detail: z.string().min(1),
});
export const adminConnectorsResponseSchema = z.array(adminConnectorStatusSchema);
export type AdminConnectorStatus = z.infer<typeof adminConnectorStatusSchema>;

export const adminDelegationRuleSchema = z.object({
  approverId: z.string().min(1),
  delegateTo: z.string().min(1),
  enabled: z.boolean().default(true),
  outOfOfficeUntil: z.string().datetime().nullable().optional(),
  note: z.string().max(2000).optional(),
});
export type AdminDelegationRule = z.infer<typeof adminDelegationRuleSchema>;

export const adminDelegationConfigSchema = z.object({
  rules: z.array(adminDelegationRuleSchema),
});
export type AdminDelegationConfig = z.infer<typeof adminDelegationConfigSchema>;
export const adminDelegationConfigUpdateSchema = adminDelegationConfigSchema.partial();
export type AdminDelegationConfigUpdate = z.infer<typeof adminDelegationConfigUpdateSchema>;

export const approvalStageModeSchema = z.enum(["SEQUENTIAL", "PARALLEL"]);
export const approvalStageDependencyTypeSchema = z.enum(["ALL_REQUIRED", "ANY_ONE", "MIN_N"]);

export const adminApprovalMatrixStageConditionSchema = z.object({
  workflowTypes: z.array(workflowTypeIdentifierSchema).optional(),
  minAmount: z.number().min(0).optional(),
  maxAmount: z.number().min(0).optional(),
  departments: z.array(z.string().min(1)).optional(),
  costCenterPrefixes: z.array(z.string().min(1)).optional(),
});
export type AdminApprovalMatrixStageCondition = z.infer<typeof adminApprovalMatrixStageConditionSchema>;

export const adminApprovalMatrixStageTemplateSchema = z.object({
  stageOrder: z.number().int().positive(),
  label: z.string().min(1),
  approverIds: z.array(z.string().min(1)).min(1),
  mode: approvalStageModeSchema,
  dependencyType: approvalStageDependencyTypeSchema,
  requiredApprovals: z.number().int().positive().optional(),
  slaHours: z.number().int().positive().nullable().optional(),
  escalatesTo: z.string().min(1).nullable().optional(),
  enabled: z.boolean().default(true),
  conditions: adminApprovalMatrixStageConditionSchema.optional(),
});
export type AdminApprovalMatrixStageTemplate = z.infer<typeof adminApprovalMatrixStageTemplateSchema>;

export const adminApprovalMatrixConfigSchema = z.object({
  templates: z.array(adminApprovalMatrixStageTemplateSchema),
});
export type AdminApprovalMatrixConfig = z.infer<typeof adminApprovalMatrixConfigSchema>;
export const adminApprovalMatrixConfigUpdateSchema = adminApprovalMatrixConfigSchema.partial();
export type AdminApprovalMatrixConfigUpdate = z.infer<typeof adminApprovalMatrixConfigUpdateSchema>;
