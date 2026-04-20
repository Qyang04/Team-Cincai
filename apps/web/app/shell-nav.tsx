"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ShellNav({
  navItems,
}: {
  navItems: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();

  return (
    <nav className="rail-nav" aria-label="Primary">
      {navItems.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rail-link${isActive ? " rail-link-active" : ""}`}
          >
            <span className="rail-link-text">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
