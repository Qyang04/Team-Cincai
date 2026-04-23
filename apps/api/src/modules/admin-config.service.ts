import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  adminPolicyConfigSchema,
  adminRoutingConfigSchema,
  type AdminPolicyConfig,
  type AdminPolicyConfigUpdate,
  type AdminRoutingConfig,
  type AdminRoutingConfigUpdate,
} from "@finance-ops/shared";
import { PrismaService } from "./prisma.service";

const DEFAULT_POLICY_CONFIG: AdminPolicyConfig = {
  managerApprovalThreshold: 500,
  requireProjectCodeWorkflows: [
    "EXPENSE_CLAIM",
    "PETTY_CASH_REIMBURSEMENT",
    "INTERNAL_PAYMENT_REQUEST",
  ],
  duplicateFilenameDetection: true,
  invoiceNumberRequiredForVendorInvoices: true,
};

const DEFAULT_ROUTING_CONFIG: AdminRoutingConfig = {
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

  async getPolicyConfig(): Promise<AdminPolicyConfig> {
    const value = await this.getSetting("policyConfig", DEFAULT_POLICY_CONFIG);
    return adminPolicyConfigSchema.parse(value);
  }

  async getRoutingConfig(): Promise<AdminRoutingConfig> {
    const value = await this.getSetting("routingConfig", DEFAULT_ROUTING_CONFIG);
    return adminRoutingConfigSchema.parse(value);
  }

  async updatePolicyConfig(partial: AdminPolicyConfigUpdate): Promise<AdminPolicyConfig> {
    const current = await this.getPolicyConfig();
    const next = adminPolicyConfigSchema.parse({ ...current, ...partial });
    await this.upsertSetting("policyConfig", next as Prisma.InputJsonValue);
    return next;
  }

  async updateRoutingConfig(partial: AdminRoutingConfigUpdate): Promise<AdminRoutingConfig> {
    const current = await this.getRoutingConfig();
    const next = adminRoutingConfigSchema.parse({ ...current, ...partial });
    await this.upsertSetting("routingConfig", next as Prisma.InputJsonValue);
    return next;
  }
}
