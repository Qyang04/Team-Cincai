export const queueNames = {
  artifactProcessing: "artifact-processing",
  aiIntake: "ai-intake",
  policyEvaluation: "policy-evaluation",
  approvalRouting: "approval-routing",
  exportProcessing: "export-processing",
  notifications: "notifications",
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];
