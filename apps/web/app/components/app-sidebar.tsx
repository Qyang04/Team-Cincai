import type { SessionUser } from "@finance-ops/shared";
import Link from "next/link";
import { ShellNav } from "../shell-nav";
import { getPrimaryNavItems } from "./nav-config";

export function AppSidebar({ user }: { user: SessionUser | null }) {
  return (
    <aside className="app-rail app-sidebar" aria-label="Primary navigation">
      <div className="rail-top">
        <Link href="/" className="brand-lockup">
          <span className="brand-mark">SF</span>
          <div>
            <span className="brand-kicker">Finance Ops</span>
            <strong>SME Ops Copilot</strong>
          </div>
        </Link>
        <p className="rail-copy">
          AI-assisted workflow control for reimbursement, invoice approval, internal payment review, and export readiness.
        </p>
      </div>

      <ShellNav navItems={getPrimaryNavItems(user)} />

      <div className="rail-footer">
        <div className="rail-card rail-card-dark">
          <p className="rail-label">System status</p>
          <strong>98.8% pipeline health</strong>
          <p className="muted">
            {user
              ? `${user.displayName} signed in with ${user.roles.join(", ").toLowerCase()} access.`
              : "Sign in to load your workflow lanes and queue access."}
          </p>
        </div>
        {user && (user.roles.includes("REQUESTER") || user.roles.includes("ADMIN")) ? (
          <Link href="/cases/new" className="button-primary button-block">
            New Case
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
