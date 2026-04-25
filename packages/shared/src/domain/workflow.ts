export const workflowTypes = [
  "EXPENSE_CLAIM",
  "PETTY_CASH_REIMBURSEMENT",
  "VENDOR_INVOICE_APPROVAL",
  "INTERNAL_PAYMENT_REQUEST",
] as const;

export type WorkflowType = (typeof workflowTypes)[number];

export const caseStatuses = [
  "DRAFT",
  "SUBMITTED",
  "INTAKE_PROCESSING",
  "AWAITING_REQUESTER_INFO",
  "POLICY_REVIEW",
  "AWAITING_APPROVAL",
  "AWAITING_APPROVER_INFO_RESPONSE",
  "FINANCE_REVIEW",
  "APPROVED",
  "REJECTED",
  "EXPORT_READY",
  "EXPORTING",
  "EXPORTED",
  "RECOVERABLE_EXCEPTION",
  "CLOSED",
] as const;

export type CaseStatus = (typeof caseStatuses)[number];

export const roleTypes = [
  "REQUESTER",
  "APPROVER",
  "FINANCE_REVIEWER",
  "ADMIN",
] as const;

export type RoleType = (typeof roleTypes)[number];

export const actorTypes = ["SYSTEM", "REQUESTER", "APPROVER", "FINANCE_REVIEWER", "ADMIN"] as const;

export type ActorType = (typeof actorTypes)[number];

export type CaseTransitionRule = {
  from: CaseStatus;
  to: CaseStatus;
};

export const caseTransitionRules: CaseTransitionRule[] = [
  { from: "DRAFT", to: "SUBMITTED" },
  { from: "SUBMITTED", to: "INTAKE_PROCESSING" },
  { from: "INTAKE_PROCESSING", to: "AWAITING_REQUESTER_INFO" },
  { from: "INTAKE_PROCESSING", to: "POLICY_REVIEW" },
  { from: "INTAKE_PROCESSING", to: "RECOVERABLE_EXCEPTION" },
  { from: "AWAITING_REQUESTER_INFO", to: "POLICY_REVIEW" },
  { from: "POLICY_REVIEW", to: "AWAITING_APPROVAL" },
  { from: "POLICY_REVIEW", to: "FINANCE_REVIEW" },
  { from: "AWAITING_APPROVAL", to: "APPROVED" },
  { from: "AWAITING_APPROVAL", to: "REJECTED" },
  { from: "AWAITING_APPROVAL", to: "AWAITING_APPROVER_INFO_RESPONSE" },
  { from: "AWAITING_APPROVER_INFO_RESPONSE", to: "AWAITING_APPROVAL" },
  { from: "APPROVED", to: "EXPORT_READY" },
  { from: "EXPORT_READY", to: "EXPORTING" },
  { from: "EXPORTING", to: "EXPORTED" },
  { from: "EXPORTING", to: "RECOVERABLE_EXCEPTION" },
  { from: "FINANCE_REVIEW", to: "APPROVED" },
  { from: "FINANCE_REVIEW", to: "REJECTED" },
  { from: "FINANCE_REVIEW", to: "AWAITING_REQUESTER_INFO" },
  { from: "FINANCE_REVIEW", to: "EXPORT_READY" },
  { from: "RECOVERABLE_EXCEPTION", to: "INTAKE_PROCESSING" },
  { from: "RECOVERABLE_EXCEPTION", to: "POLICY_REVIEW" },
  { from: "RECOVERABLE_EXCEPTION", to: "EXPORT_READY" },
  { from: "REJECTED", to: "CLOSED" },
  { from: "EXPORTED", to: "CLOSED" },
];

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return caseTransitionRules.some((rule) => rule.from === from && rule.to === to);
}

