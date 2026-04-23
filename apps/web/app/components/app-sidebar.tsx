import Link from "next/link";
import { ShellNav } from "../shell-nav";
import { PRIMARY_NAV_ITEMS } from "./nav-config";

export function AppSidebar() {
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

      <ShellNav navItems={PRIMARY_NAV_ITEMS} />

      <div className="rail-footer">
        <div className="rail-card rail-card-dark">
          <p className="rail-label">System status</p>
          <strong>98.8% pipeline health</strong>
          <p className="muted">Intake, approval, and export connectors are available for demo workflows.</p>
        </div>
        <Link href="/cases/new" className="button-primary button-block">
          New Case
        </Link>
      </div>
    </aside>
  );
}
