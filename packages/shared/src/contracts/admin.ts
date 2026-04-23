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
