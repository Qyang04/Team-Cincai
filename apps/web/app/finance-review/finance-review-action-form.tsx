"use client";

import { DEFAULT_API_BASE_URL, financeReviewActionResponseSchema } from "@finance-ops/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

type Mode = "approve" | "reject" | "send-back";

type Feedback = { kind: "success"; message: string } | { kind: "error"; message: string } | null;

export function FinanceReviewActionForm({ reviewId }: { reviewId: string }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(mode: Mode, formData: FormData) {
    setFeedback(null);
    setPendingMode(mode);

    const reviewerId = String(formData.get("reviewerId") ?? "finance.reviewer").trim() || "finance.reviewer";
    const note = String(formData.get("note") ?? "").trim();

    if (mode === "send-back" && !note) {
      setFeedback({ kind: "error", message: "Explain what information is still needed before sending back." });
      setPendingMode(null);
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/cases/finance-review/${reviewId}/${mode}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mock-role": "FINANCE_REVIEWER",
            "x-mock-user-id": reviewerId,
          },
          body: JSON.stringify({ reviewerId, note: note || undefined }),
        });

        if (!response.ok) {
          throw new Error(`Finance review action failed (${response.status}).`);
        }
        const result = financeReviewActionResponseSchema.parse(await response.json());
        if (!result.success) {
          throw new Error(result.error);
        }

        const successMessage =
          mode === "approve"
            ? "Approved. Case moved toward export-ready."
            : mode === "reject"
            ? "Rejected. Case moved to REJECTED."
            : "Sent back. Requester will be asked for additional information.";

        setFeedback({ kind: "success", message: successMessage });
        router.refresh();
      } catch (error) {
        setFeedback({
          kind: "error",
          message: error instanceof Error ? error.message : "Unexpected finance review error.",
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
          name="reviewerId"
          defaultValue="finance.reviewer"
          className="field-control"
          suppressHydrationWarning
        />
      </label>

      <label className="field">
        <span className="field-label">Review note</span>
        <textarea
          name="note"
          rows={3}
          placeholder="Optional review note for approve / reject. Required when sending back for more info."
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
          onClick={(event) => submit("send-back", new FormData(event.currentTarget.form ?? undefined))}
          suppressHydrationWarning
        >
          {isPending && pendingMode === "send-back" ? "Sending..." : "Send back"}
        </button>
      </div>

      {feedback ? (
        <p className={feedback.kind === "error" ? "text-danger" : "muted"}>{feedback.message}</p>
      ) : null}
    </form>
  );
}
