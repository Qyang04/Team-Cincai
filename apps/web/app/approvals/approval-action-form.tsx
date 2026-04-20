"use client";

import { useState, useTransition } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export function ApprovalActionForm({
  taskId,
  mode,
}: {
  taskId: string;
  mode: "approve" | "reject" | "request-info";
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setMessage(null);
    const approverId = String(formData.get("approverId") ?? "manager.approver");
    const detail = String(formData.get("detail") ?? "");

    startTransition(async () => {
      try {
        const route =
          mode === "approve"
            ? "approve"
            : mode === "reject"
              ? "reject"
              : "request-info";

        const body =
          mode === "request-info"
            ? { approverId, question: detail }
            : { approverId, decisionReason: detail };

        const response = await fetch(`${apiBaseUrl}/cases/approvals/${taskId}/${route}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error("Approval action failed.");
        }

        setMessage("Action submitted. Refresh to see updated queue state.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unexpected approval error.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="inline-form">
      <input type="hidden" name="approverId" value="manager.approver" />
      <textarea
        name="detail"
        rows={3}
        placeholder={mode === "request-info" ? "Ask for missing information" : "Optional rationale"}
        className="field-control"
      />
      <button type="submit" disabled={isPending} className={mode === "approve" ? "button-primary" : "button-secondary"}>
        {isPending ? "Submitting..." : mode === "request-info" ? "Request info" : mode[0].toUpperCase() + mode.slice(1)}
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
