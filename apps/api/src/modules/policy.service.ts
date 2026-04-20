import { Injectable } from "@nestjs/common";
import type { PolicyCheckResult } from "@finance-ops/shared";
import { AdminConfigService } from "./admin-config.service";
import { PrismaService } from "./prisma.service";

@Injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminConfigService: AdminConfigService,
  ) {}

  async evaluateCase(caseId: string): Promise<PolicyCheckResult> {
    const caseRecord = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        extractionResults: { orderBy: { createdAt: "desc" }, take: 1 },
        artifacts: true,
      },
    });

    if (!caseRecord) {
      throw new Error("Case not found");
    }

    const latestExtraction = caseRecord.extractionResults[0];
    const fields = (latestExtraction?.fieldsJson as Record<string, unknown> | undefined) ?? {};
    const amount = typeof fields.amount === "number" ? fields.amount : 0;
    const projectCode = typeof fields.projectCode === "string" ? fields.projectCode : "";
    const policyConfig = await this.adminConfigService.getPolicyConfig();

    const warnings: string[] = [];
    const blockingIssues: string[] = [];
    const duplicateSignals: string[] = [];

    if (!caseRecord.artifacts.length) {
      warnings.push("No artifacts attached to the case.");
    }

    if (policyConfig.requireProjectCodeWorkflows.includes(caseRecord.workflowType) && !projectCode) {
      blockingIssues.push("Project code is required before approval.");
    }

    const lowerNames = caseRecord.artifacts.map((artifact) => artifact.filename.toLowerCase());
    if (policyConfig.duplicateFilenameDetection && new Set(lowerNames).size !== lowerNames.length) {
      duplicateSignals.push("Duplicate filenames detected.");
    }
    if (policyConfig.duplicateFilenameDetection && lowerNames.some((name) => name.includes("duplicate"))) {
      duplicateSignals.push("Filename indicates a possible duplicate submission.");
    }

    let requiresFinanceReview = duplicateSignals.length > 0;
    if (amount > policyConfig.managerApprovalThreshold) {
      warnings.push("Amount exceeds standard manager-only threshold.");
      requiresFinanceReview = true;
    }

    if (
      caseRecord.workflowType === "VENDOR_INVOICE_APPROVAL" &&
      policyConfig.invoiceNumberRequiredForVendorInvoices &&
      !fields.invoiceNumber
    ) {
      warnings.push("Invoice number is missing from extracted fields.");
      requiresFinanceReview = true;
    }

    const result: PolicyCheckResult = {
      passed: blockingIssues.length === 0,
      warnings,
      blockingIssues,
      requiresFinanceReview,
      duplicateSignals,
    };

    await this.prisma.policyResult.create({
      data: {
        caseId,
        passed: result.passed,
        warnings: result.warnings,
        blockingIssues: result.blockingIssues,
        requiresFinanceReview: result.requiresFinanceReview,
        duplicateSignals: result.duplicateSignals,
      },
    });

    return result;
  }

  async getLatestPolicyResult(caseId: string) {
    return this.prisma.policyResult.findFirst({
      where: { caseId },
      orderBy: { createdAt: "desc" },
    });
  }
}
