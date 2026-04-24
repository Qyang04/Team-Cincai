import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  adminApprovalMatrixConfigSchema,
  adminDelegationConfigSchema,
  adminPolicyConfigSchema,
  adminRoutingConfigSchema,
  type AdminApprovalMatrixConfig,
  type AdminApprovalMatrixConfigUpdate,
  type AdminDelegationConfig,
  type AdminDelegationConfigUpdate,
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
  duplicateEvidenceDetection: true,
  invoiceNumberRequiredForVendorInvoices: true,
};

const DEFAULT_ROUTING_CONFIG: AdminRoutingConfig = {
  defaultApproverId: "manager.approver",
  financeReviewerId: "finance.reviewer",
  escalationWindowHours: 24,
};

const DEFAULT_DELEGATION_CONFIG: AdminDelegationConfig = {
  rules: [],
};

const DEFAULT_APPROVAL_MATRIX_CONFIG: AdminApprovalMatrixConfig = {
  templates: [],
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
    return adminPolicyConfigSchema.parse({ ...DEFAULT_POLICY_CONFIG, ...value });
  }

  async getRoutingConfig(): Promise<AdminRoutingConfig> {
    const value = await this.getSetting("routingConfig", DEFAULT_ROUTING_CONFIG);
    return adminRoutingConfigSchema.parse({ ...DEFAULT_ROUTING_CONFIG, ...value });
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

  async getDelegationConfig(): Promise<AdminDelegationConfig> {
    const value = await this.getSetting("delegationConfig", DEFAULT_DELEGATION_CONFIG);
    return adminDelegationConfigSchema.parse({ ...DEFAULT_DELEGATION_CONFIG, ...value });
  }

  async updateDelegationConfig(partial: AdminDelegationConfigUpdate): Promise<AdminDelegationConfig> {
    const current = await this.getDelegationConfig();
    const next = adminDelegationConfigSchema.parse({ ...current, ...partial });
    await this.upsertSetting("delegationConfig", next as Prisma.InputJsonValue);
    return next;
  }

  async getApprovalMatrixConfig(): Promise<AdminApprovalMatrixConfig> {
    const value = await this.getSetting("approvalMatrixConfig", DEFAULT_APPROVAL_MATRIX_CONFIG);
    return adminApprovalMatrixConfigSchema.parse({ ...DEFAULT_APPROVAL_MATRIX_CONFIG, ...value });
  }

  async updateApprovalMatrixConfig(partial: AdminApprovalMatrixConfigUpdate): Promise<AdminApprovalMatrixConfig> {
    const current = await this.getApprovalMatrixConfig();
    const next = adminApprovalMatrixConfigSchema.parse({ ...current, ...partial });
    await this.upsertSetting("approvalMatrixConfig", next as Prisma.InputJsonValue);
    return next;
  }
}
