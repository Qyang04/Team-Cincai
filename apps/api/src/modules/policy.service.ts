import { Injectable } from "@nestjs/common";
import type { PolicyCheckResult } from "@finance-ops/shared";
import { AdminConfigService } from "./admin-config.service";
import { PrismaService } from "./prisma.service";

type ExtractionFields = Record<string, unknown>;

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function valuesMatch(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function hasArithmeticMismatch(fields: ExtractionFields) {
  const netAmount = toNumberValue(fields.netAmount);
  const taxAmount = toNumberValue(fields.taxAmount);
  const grossAmount = toNumberValue(fields.grossAmount);
  if (netAmount === undefined || taxAmount === undefined || grossAmount === undefined) {
    return false;
  }
  return Math.abs(netAmount + taxAmount - grossAmount) > 0.01;
}

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
    const fields = (latestExtraction?.fieldsJson as ExtractionFields | undefined) ?? {};
    const amount = toNumberValue(fields.amount) ?? 0;
    const projectCode = toStringValue(fields.projectCode);
    const invoiceNumber = toStringValue(fields.invoiceNumber);
    const merchant = toStringValue(fields.merchant) || toStringValue(fields.vendorName);
    const spendDate = toStringValue(fields.spendDate);
    const policyConfig = await this.adminConfigService.getPolicyConfig();

    const warnings: string[] = [];
    const blockingIssues: string[] = [];
    const duplicateSignals: string[] = [];
    const reconciliationFlags: string[] = [];

    if (!caseRecord.artifacts.length) {
      warnings.push("No artifacts attached to the case.");
    }

    if (policyConfig.requireProjectCodeWorkflows.includes(caseRecord.workflowType) && !projectCode) {
      blockingIssues.push("Project code is required before approval.");
      reconciliationFlags.push("MISSING_PROJECT_CODE");
    }

    const lowerNames = caseRecord.artifacts.map((artifact: { filename: string }) => artifact.filename.toLowerCase());
    if (policyConfig.duplicateFilenameDetection && new Set(lowerNames).size !== lowerNames.length) {
      duplicateSignals.push("Duplicate filenames detected.");
    }
    if (policyConfig.duplicateFilenameDetection && lowerNames.some((name: string) => name.includes("duplicate"))) {
      duplicateSignals.push("Filename indicates a possible duplicate submission.");
    }

    if (
      caseRecord.workflowType === "VENDOR_INVOICE_APPROVAL" &&
      policyConfig.invoiceNumberRequiredForVendorInvoices &&
      !invoiceNumber
    ) {
      warnings.push("Invoice number is missing from extracted fields.");
      reconciliationFlags.push("MISSING_INVOICE_NUMBER");
    }

    if (hasArithmeticMismatch(fields)) {
      warnings.push("Net, tax, and gross values do not reconcile.");
      reconciliationFlags.push("TAX_ARITHMETIC_MISMATCH");
    }
    if (fields.amountDiscrepancyFlag === true) {
      warnings.push("Estimated and realized amounts appear to differ.");
      reconciliationFlags.push("AMOUNT_DISCREPANCY");
    }
    if (fields.taxMismatchFlag === true) {
      warnings.push("Tax extraction appears inconsistent.");
      reconciliationFlags.push("TAX_MISMATCH");
    }

    if (policyConfig.duplicateEvidenceDetection) {
      const checksumMatches = caseRecord.artifacts
        .filter((artifact) => typeof artifact.checksum === "string" && artifact.checksum.length > 0)
        .map((artifact) => artifact.checksum as string);

      if (checksumMatches.length > 0) {
        const duplicateArtifacts = await this.prisma.artifact.findMany({
          where: {
            caseId: { not: caseId },
            checksum: { in: checksumMatches },
          },
          select: { caseId: true, checksum: true, filename: true },
        });
        for (const artifact of duplicateArtifacts) {
          duplicateSignals.push(`Matching artifact checksum found on case ${artifact.caseId} (${artifact.filename}).`);
        }
      }

      const otherExtractions = await this.prisma.extractionResult.findMany({
        where: { caseId: { not: caseId } },
        orderBy: { createdAt: "desc" },
        select: { caseId: true, fieldsJson: true },
      });
      const latestByCase = new Map<string, ExtractionFields>();
      for (const extraction of otherExtractions) {
        if (!latestByCase.has(extraction.caseId)) {
          latestByCase.set(extraction.caseId, (extraction.fieldsJson as ExtractionFields | undefined) ?? {});
        }
      }

      for (const [otherCaseId, otherFields] of latestByCase.entries()) {
        const otherInvoiceNumber = toStringValue(otherFields.invoiceNumber);
        const otherMerchant = toStringValue(otherFields.merchant) || toStringValue(otherFields.vendorName);
        const otherAmount = toNumberValue(otherFields.amount);
        const otherSpendDate = toStringValue(otherFields.spendDate);

        if (invoiceNumber && valuesMatch(invoiceNumber, otherInvoiceNumber)) {
          duplicateSignals.push(`Invoice number ${invoiceNumber} also appears on case ${otherCaseId}.`);
          continue;
        }

        if (
          merchant &&
          valuesMatch(merchant, otherMerchant) &&
          amount > 0 &&
          otherAmount !== undefined &&
          Math.abs(amount - otherAmount) <= 0.01 &&
          spendDate &&
          valuesMatch(spendDate, otherSpendDate)
        ) {
          duplicateSignals.push(`Merchant, amount, and spend date closely match case ${otherCaseId}.`);
        }
      }
    }

    let requiresFinanceReview = duplicateSignals.length > 0 || reconciliationFlags.length > 0;
    if (amount > policyConfig.managerApprovalThreshold) {
      warnings.push("Amount exceeds standard manager-only threshold.");
      requiresFinanceReview = true;
    }
    if (
      caseRecord.workflowType === "VENDOR_INVOICE_APPROVAL" &&
      policyConfig.invoiceNumberRequiredForVendorInvoices &&
      !invoiceNumber
    ) {
      requiresFinanceReview = true;
    }

    const uniqueDuplicateSignals = [...new Set(duplicateSignals)];
    const uniqueReconciliationFlags = [...new Set(reconciliationFlags)];
    const approvalRequirement =
      blockingIssues.length > 0 ? "CLARIFICATION_REQUIRED" : requiresFinanceReview ? "FINANCE_REVIEW" : "MANAGER_APPROVAL";

    const result: PolicyCheckResult = {
      passed: blockingIssues.length === 0,
      warnings,
      blockingIssues,
      requiresFinanceReview,
      duplicateSignals: uniqueDuplicateSignals,
      reconciliationFlags: uniqueReconciliationFlags,
      approvalRequirement,
    };

    await this.prisma.policyResult.create({
      data: {
        caseId,
        passed: result.passed,
        warnings: result.warnings,
        blockingIssues: result.blockingIssues,
        requiresFinanceReview: result.requiresFinanceReview,
        duplicateSignals: result.duplicateSignals,
        reconciliationFlags: result.reconciliationFlags ?? [],
        approvalRequirement: result.approvalRequirement ?? null,
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
