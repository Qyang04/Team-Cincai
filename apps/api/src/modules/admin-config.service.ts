import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";

type PolicyConfig = {
  managerApprovalThreshold: number;
  requireProjectCodeWorkflows: string[];
  duplicateFilenameDetection: boolean;
  invoiceNumberRequiredForVendorInvoices: boolean;
};

type RoutingConfig = {
  defaultApproverId: string;
  financeReviewerId: string;
  escalationWindowHours: number;
};

const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  managerApprovalThreshold: 500,
  requireProjectCodeWorkflows: [
    "EXPENSE_CLAIM",
    "PETTY_CASH_REIMBURSEMENT",
    "INTERNAL_PAYMENT_REQUEST",
  ],
  duplicateFilenameDetection: true,
  invoiceNumberRequiredForVendorInvoices: true,
};

const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  defaultApproverId: "manager.approver",
  financeReviewerId: "finance.reviewer",
  escalationWindowHours: 24,
};

@Injectable()
export class AdminConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    const setting = await this.prisma.adminSetting.findUnique({ where: { key } });
    return (setting?.value as T | undefined) ?? defaultValue;
  }

  private upsertSetting(key: string, value: Prisma.InputJsonValue) {
    return this.prisma.adminSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  getPolicyConfig() {
    return this.getSetting("policyConfig", DEFAULT_POLICY_CONFIG);
  }

  getRoutingConfig() {
    return this.getSetting("routingConfig", DEFAULT_ROUTING_CONFIG);
  }

  async updatePolicyConfig(partial: Partial<PolicyConfig>) {
    const current = await this.getPolicyConfig();
    const next = { ...current, ...partial };
    await this.upsertSetting("policyConfig", next as Prisma.InputJsonValue);
    return next;
  }

  async updateRoutingConfig(partial: Partial<RoutingConfig>) {
    const current = await this.getRoutingConfig();
    const next = { ...current, ...partial };
    await this.upsertSetting("routingConfig", next as Prisma.InputJsonValue);
    return next;
  }
}

