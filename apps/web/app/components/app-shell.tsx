"use client";

import { useId, useState, type ReactNode } from "react";

type AppShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
};

export function AppShell({ sidebar, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarRegionId = useId();

  return (
    <div className={`app-shell${sidebarOpen ? "" : " app-shell--sidebar-collapsed"}`}>
      <div className="app-sidebar-column" id={sidebarRegionId}>
        {sidebar}
      </div>
      <main className="app-main">
        <div className="topbar">
          <div className="topbar-search">
            <button
              type="button"
              className="sidebar-toggle"
              aria-label={sidebarOpen ? "Hide navigation" : "Show navigation"}
              aria-expanded={sidebarOpen}
              aria-controls={sidebarRegionId}
              onClick={() => setSidebarOpen((open) => !open)}
              suppressHydrationWarning
            >
              <span className="sidebar-toggle-icon" aria-hidden>
                <span />
                <span />
                <span />
              </span>
            </button>
            <span className="topbar-label">SME Finance Ops Copilot</span>
            <div className="search-shell">
              <span className="search-icon">Search</span>
              <span className="search-placeholder">Search workflows, cases, or exceptions</span>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="topbar-chip">AI Copilot Active</span>
            <span className="avatar-badge">AC</span>
          </div>
        </div>
        <div className="app-main-scroll">{children}</div>
      </main>
    </div>
  );
}
