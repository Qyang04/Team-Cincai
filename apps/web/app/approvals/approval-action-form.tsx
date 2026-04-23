"use client";

import { DEFAULT_API_BASE_URL, approvalActionResponseSchema } from "@finance-ops/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

type Mode = "approve" | "reject" | "request-info";

type Feedback = { kind: "success"; message: string } | { kind: "error"; message: string } | null;

export function ApprovalActionForm({ taskId }: { taskId: string }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(mode: Mode, formData: FormData) {
    setFeedback(null);
    setPendingMode(mode);

    const approverId = String(formData.get("approverId") ?? "manager.approver").trim() || "manager.approver";
    const detail = String(formData.get("detail") ?? "").trim();

    if (mode === "request-info" && !detail) {
      setFeedback({ kind: "error", message: "Please describe what information is needed from the requester." });
      setPendingMode(null);
      return;
    }

    startTransition(async () => {
      try {
        const body =
          mode === "request-info"
            ? { approverId, question: detail }
            : { approverId, decisionReason: detail || undefined };

        const response = await fetch(`${apiBaseUrl}/cases/approvals/${taskId}/${mode}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mock-role": "APPROVER",
            "x-mock-user-id": approverId,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`Approval action failed (${response.status}).`);
        }
        const result = approvalActionResponseSchema.parse(await response.json());
        if (!result.success) {
          throw new Error(result.error);
        }

        const successMessage =
          mode === "approve"
            ? "Approved. Case moved toward export-ready."
            : mode === "reject"
            ? "Rejected. Case moved to REJECTED."
            : "Information requested. Requester has been notified in-app.";

        setFeedback({ kind: "success", message: successMessage });
        router.refresh();
      } catch (error) {
        setFeedback({
          kind: "error",
          message: error instanceof Error ? error.message : "Unexpected approval error.",
        });
      } finally {
        setPendingMode(null);
      }
    });
  }

  return (
    <form
      className="form-grid"
      onSubmit={(event) => event.preventDefault()}
      style={{ marginTop: 12 }}
    >
      <label className="field">
        <span className="field-label">Acting as</span>
        <input
          name="approverId"
          defaultValue="manager.approver"
          className="field-control"
          suppressHydrationWarning
        />
      </label>

      <label className="field">
        <span className="field-label">Rationale or question</span>
        <textarea
          name="detail"
          rows={3}
          placeholder="Optional rationale for approve / reject. Required when requesting info."
          className="field-control"
          suppressHydrationWarning
        />
      </label>

      <div className="split-actions">
        <button
          type="button"
          className="button-primary"
          disabled={isPending}
          onClick={(event) => submit("approve", new FormData(event.currentTarget.form ?? undefined))}
          suppressHydrationWarning
        >
          {isPending && pendingMode === "approve" ? "Approving..." : "Approve"}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={isPending}
          onClick={(event) => submit("reject", new FormData(event.currentTarget.form ?? undefined))}
          suppressHydrationWarning
        >
          {isPending && pendingMode === "reject" ? "Rejecting..." : "Reject"}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={isPending}
          onClick={(event) => submit("request-info", new FormData(event.currentTarget.form ?? undefined))}
          suppressHydrationWarning
        >
          {isPending && pendingMode === "request-info" ? "Sending..." : "Request info"}
        </button>
      </div>

      {feedback ? (
        <p className={feedback.kind === "error" ? "text-danger" : "muted"}>{feedback.message}</p>
      ) : null}
    </form>
  );
}
