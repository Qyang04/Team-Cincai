import test from "node:test";
import assert from "node:assert/strict";
import { PolicyService } from "./policy.service";

test("PolicyService routes cases above the configured threshold to finance review", async () => {
  const prisma = {
    case: {
      findUnique: async () => ({
        workflowType: "EXPENSE_CLAIM",
        artifacts: [{ filename: "receipt.jpg" }],
        extractionResults: [
          {
            fieldsJson: {
              amount: 950,
              projectCode: "OPS-12",
            },
          },
        ],
      }),
    },
    policyResult: {
      create: async () => undefined,
    },
  };

  const adminConfigService = {
    getPolicyConfig: async () => ({
      managerApprovalThreshold: 500,
      requireProjectCodeWorkflows: ["EXPENSE_CLAIM"],
      duplicateFilenameDetection: true,
      invoiceNumberRequiredForVendorInvoices: true,
    }),
  };

  const service = new PolicyService(prisma as never, adminConfigService as never);
  const result = await service.evaluateCase("case-1");

  assert.equal(result.requiresFinanceReview, true);
  assert.ok(result.warnings.includes("Amount exceeds standard manager-only threshold."));
});
