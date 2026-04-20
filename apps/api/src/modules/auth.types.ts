import type { RoleType } from "@finance-ops/shared";

export type AuthenticatedUser = {
  id: string;
  email?: string;
  roles: RoleType[];
  source: "mock" | "supabase";
};

