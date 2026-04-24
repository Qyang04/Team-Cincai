import { Injectable } from "@nestjs/common";
import { type RoleType, roleTypes } from "@finance-ops/shared";
import { PrismaService } from "./prisma.service";

type SessionDirectoryUser = {
  id: string;
  email: string;
  displayName: string;
  roles: RoleType[];
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  managerUserId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const demoDepartments = [
  { code: "OPS", name: "Operations" },
  { code: "FIN", name: "Finance" },
  { code: "PROC", name: "Procurement" },
  { code: "TREAS", name: "Treasury" },
] as const;

const demoUsers = [
  {
    id: "demo.requester",
    email: "requester.demo@finance-ops.local",
    displayName: "Alicia Requester",
    roles: ["REQUESTER"],
    departmentCode: "OPS",
    managerUserId: "manager.approver",
  },
  {
    id: "manager.approver",
    email: "manager.demo@finance-ops.local",
    displayName: "Marco Approver",
    roles: ["APPROVER"],
    departmentCode: "OPS",
    managerUserId: "director.approver",
  },
  {
    id: "director.approver",
    email: "director.demo@finance-ops.local",
    displayName: "Daria Director",
    roles: ["APPROVER"],
    departmentCode: "OPS",
    managerUserId: null,
  },
  {
    id: "finance.reviewer",
    email: "finance.demo@finance-ops.local",
    displayName: "Farah Finance",
    roles: ["FINANCE_REVIEWER"],
    departmentCode: "FIN",
    managerUserId: "admin.user",
  },
  {
    id: "finance.controller",
    email: "controller.demo@finance-ops.local",
    displayName: "Connor Controller",
    roles: ["APPROVER", "FINANCE_REVIEWER"],
    departmentCode: "FIN",
    managerUserId: "admin.user",
  },
  {
    id: "compliance.approver",
    email: "compliance.demo@finance-ops.local",
    displayName: "Celine Compliance",
    roles: ["APPROVER"],
    departmentCode: "FIN",
    managerUserId: "admin.user",
  },
  {
    id: "procurement.approver",
    email: "procurement.demo@finance-ops.local",
    displayName: "Priya Procurement",
    roles: ["APPROVER"],
    departmentCode: "PROC",
    managerUserId: "admin.user",
  },
  {
    id: "treasury.approver",
    email: "treasury.demo@finance-ops.local",
    displayName: "Theo Treasury",
    roles: ["APPROVER"],
    departmentCode: "TREAS",
    managerUserId: "admin.user",
  },
  {
    id: "admin.user",
    email: "admin.demo@finance-ops.local",
    displayName: "Ada Admin",
    roles: ["ADMIN", "APPROVER", "FINANCE_REVIEWER"],
    departmentCode: "FIN",
    managerUserId: null,
  },
] as const;

const legacyUserIdMap: Record<string, string> = {
  "manager.approver.v2": "manager.approver",
  "finance.reviewer.v2": "finance.reviewer",
};

const demoLoginUserIds = [
  "demo.requester",
  "manager.approver",
  "finance.reviewer",
  "admin.user",
] as const;

function toIsoDateTimeString(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

function normalizeRoles(value: string[]): RoleType[] {
  return value.filter((role): role is RoleType => roleTypes.includes(role as RoleType));
}

function remapLegacyUserId(value: string | null | undefined): string | null | undefined {
  if (!value) {
    return value;
  }
  return legacyUserIdMap[value] ?? value;
}

function remapLegacyIdsInJson(value: unknown): unknown {
  if (typeof value === "string") {
    return remapLegacyUserId(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => remapLegacyIdsInJson(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, remapLegacyIdsInJson(entry)]),
    );
  }
  return value;
}

@Injectable()
export class UserDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async normalizeLegacyAssignments() {
    for (const [legacyId, currentId] of Object.entries(legacyUserIdMap)) {
      await this.prisma.approvalTask.updateMany({
        where: { approverId: legacyId },
        data: { approverId: currentId },
      });
      await this.prisma.approvalTask.updateMany({
        where: { delegatedFrom: legacyId },
        data: { delegatedFrom: currentId },
      });
      await this.prisma.approvalTask.updateMany({
        where: { actingApproverId: legacyId },
        data: { actingApproverId: currentId },
      });
      await this.prisma.financeReview.updateMany({
        where: { reviewerId: legacyId },
        data: { reviewerId: currentId },
      });
      await this.prisma.financeReview.updateMany({
        where: { ownerId: legacyId },
        data: { ownerId: currentId },
      });
      await this.prisma.approvalStage.updateMany({
        where: { escalatesTo: legacyId },
        data: { escalatesTo: currentId },
      });
    }

    const settingsToNormalize = ["routingConfig", "delegationConfig", "approvalMatrixConfig"];
    for (const key of settingsToNormalize) {
      const setting = await this.prisma.adminSetting.findUnique({ where: { key } });
      if (!setting) {
        continue;
      }
      const normalizedValue = remapLegacyIdsInJson(setting.value);
      if (JSON.stringify(normalizedValue) === JSON.stringify(setting.value)) {
        continue;
      }
      await this.prisma.adminSetting.update({
        where: { key },
        data: { value: normalizedValue as never },
      });
    }
  }

  async ensureSeedData() {
    for (const department of demoDepartments) {
      await this.prisma.department.upsert({
        where: { code: department.code },
        update: { name: department.name },
        create: department,
      });
    }

    const departments = await this.prisma.department.findMany();
    const departmentIdByCode = new Map(departments.map((department) => [department.code, department.id]));

    for (const user of demoUsers) {
      await this.prisma.userProfile.upsert({
        where: { id: user.id },
        update: {
          email: user.email,
          displayName: user.displayName,
          roles: [...user.roles],
          departmentId: departmentIdByCode.get(user.departmentCode) ?? null,
          managerUserId: null,
          isActive: true,
        },
        create: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          roles: [...user.roles],
          departmentId: departmentIdByCode.get(user.departmentCode) ?? null,
          managerUserId: null,
          isActive: true,
        },
      });
    }

    for (const user of demoUsers) {
      await this.prisma.userProfile.update({
        where: { id: user.id },
        data: {
          managerUserId: user.managerUserId,
        },
      });
    }

    await this.normalizeLegacyAssignments();
  }

  async getUserById(userId: string): Promise<SessionDirectoryUser | null> {
    const user = await this.prisma.userProfile.findUnique({
      where: { id: userId },
      include: { department: true },
    });
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: normalizeRoles(user.roles),
      departmentId: user.departmentId ?? null,
      departmentCode: user.department?.code ?? null,
      departmentName: user.department?.name ?? null,
      managerUserId: user.managerUserId ?? null,
      isActive: user.isActive,
      createdAt: toIsoDateTimeString(user.createdAt),
      updatedAt: toIsoDateTimeString(user.updatedAt),
    };
  }

  async getUserByEmail(email: string): Promise<SessionDirectoryUser | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.userProfile.findUnique({
      where: { email: normalizedEmail },
      include: { department: true },
    });
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: normalizeRoles(user.roles),
      departmentId: user.departmentId ?? null,
      departmentCode: user.department?.code ?? null,
      departmentName: user.department?.name ?? null,
      managerUserId: user.managerUserId ?? null,
      isActive: user.isActive,
      createdAt: toIsoDateTimeString(user.createdAt),
      updatedAt: toIsoDateTimeString(user.updatedAt),
    };
  }

  async listUsers(): Promise<SessionDirectoryUser[]> {
    const users = await this.prisma.userProfile.findMany({
      orderBy: { displayName: "asc" },
      include: { department: true },
    });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: normalizeRoles(user.roles),
      departmentId: user.departmentId ?? null,
      departmentCode: user.department?.code ?? null,
      departmentName: user.department?.name ?? null,
      managerUserId: user.managerUserId ?? null,
      isActive: user.isActive,
      createdAt: toIsoDateTimeString(user.createdAt),
      updatedAt: toIsoDateTimeString(user.updatedAt),
    }));
  }

  async listDemoLoginUsers(): Promise<SessionDirectoryUser[]> {
    const users = await this.listUsers();
    const order = new Map<string, number>(demoLoginUserIds.map((id, index) => [id, index]));
    return users
      .filter((user) => order.has(user.id))
      .sort((left, right) => (order.get(left.id) ?? 999) - (order.get(right.id) ?? 999));
  }

  async listDepartments() {
    const departments = await this.prisma.department.findMany({
      orderBy: { name: "asc" },
    });
    return departments.map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
      createdAt: toIsoDateTimeString(department.createdAt),
      updatedAt: toIsoDateTimeString(department.updatedAt),
    }));
  }
}
