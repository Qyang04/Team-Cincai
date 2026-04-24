import type { RoleType } from "@finance-ops/shared";

export type AuthenticatedUser = {
  id: string;
  email?: string;
  displayName?: string;
  roles: RoleType[];
  departmentId?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  managerUserId?: string | null;
  source: "mock" | "app" | "supabase";
};
