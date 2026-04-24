"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ApprovalToastPayload = {
  kind: "success" | "error";
  message: string;
};

export const approvalToastEventName = "approvals:toast";

export function publishApprovalToast(payload: ApprovalToastPayload) {
  window.dispatchEvent(new CustomEvent<ApprovalToastPayload>(approvalToastEventName, { detail: payload }));
}

export function ApprovalsToastHost() {
  const [toast, setToast] = useState<ApprovalToastPayload | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      const customEvent = event as CustomEvent<ApprovalToastPayload>;
      if (!customEvent.detail) {
        return;
      }
      setToast(customEvent.detail);
    };

    window.addEventListener(approvalToastEventName, onToast);
    return () => {
      window.removeEventListener(approvalToastEventName, onToast);
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast || !mounted) {
    return null;
  }

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 80,
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${toast.kind === "error" ? "#dc2626" : "#16a34a"}`,
        background: toast.kind === "error" ? "#fef2f2" : "#f0fdf4",
        color: toast.kind === "error" ? "#991b1b" : "#166534",
        boxShadow: "0 8px 20px rgba(15, 23, 42, 0.15)",
        maxWidth: 420,
      }}
    >
      {toast.message}
    </div>,
    document.body,
  );
}
