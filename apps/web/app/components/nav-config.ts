export type NavItem = {
  href: string;
  label: string;
};

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cases/new", label: "New Case" },
  { href: "/debug", label: "Debug" },
  { href: "/approvals", label: "Approvals" },
  { href: "/finance-review", label: "Finance Review" },
  { href: "/admin/policies", label: "Admin" },
];
