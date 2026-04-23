import "./globals.css";
import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import React from "react";
import { AppShell } from "./components/app-shell";
import { AppSidebar } from "./components/app-sidebar";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
        <div className="app-frame">
          <AppShell sidebar={<AppSidebar />}>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
