import "./globals.css";
import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import React from "react";
import { ShellNav } from "./shell-nav";

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "SME Finance Ops Copilot",
  description: "Agentic finance workflow platform for claims, invoices, and internal payment operations.",
};

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cases/new", label: "New Case" },
  { href: "/approvals", label: "Approvals" },
  { href: "/finance-review", label: "Finance Review" },
  { href: "/admin/policies", label: "Admin" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
        <div className="app-frame">
          <div className="app-shell">
            <aside className="app-rail">
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

              <ShellNav navItems={navItems} />

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
            <main className="app-main">
              <div className="topbar">
                <div className="topbar-search">
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
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
