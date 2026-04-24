import type { SessionUser } from "@finance-ops/shared";

export type NavItem = {
  href: string;
  label: string;
};

const PRIMARY_NAV_ITEMS: Array<NavItem & { roles?: SessionUser["roles"][number][] }> = [
  { href: "/", label: "Overview" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cases/new", label: "New Case", roles: ["REQUESTER", "ADMIN"] },
  { href: "/debug", label: "Debug" },
  { href: "/approvals", label: "Approvals", roles: ["APPROVER", "ADMIN"] },
  { href: "/finance-review", label: "Finance Review", roles: ["FINANCE_REVIEWER", "ADMIN"] },
  { href: "/admin/policies", label: "Admin", roles: ["ADMIN"] },
];

export function getPrimaryNavItems(user: SessionUser | null): NavItem[] {
  if (!user) {
    return PRIMARY_NAV_ITEMS.filter((item) => !item.roles);
  }

  return PRIMARY_NAV_ITEMS.filter((item) => !item.roles || item.roles.some((role) => user.roles.includes(role))).map(
    ({ href, label }) => ({ href, label }),
  );
}
