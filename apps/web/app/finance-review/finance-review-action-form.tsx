"use client";

import { useState, useTransition } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export function FinanceReviewActionForm({
  reviewId,
  mode,
}: {
  reviewId: string;
  mode: "approve" | "reject" | "send-back";
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setMessage(null);
    const reviewerId = String(formData.get("reviewerId") ?? "finance.reviewer");
    const note = String(formData.get("note") ?? "");

    startTransition(async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/cases/finance-review/${reviewId}/${mode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewerId, note }),
        });

        if (!response.ok) {
          throw new Error("Finance review action failed.");
        }

        setMessage("Action submitted. Refresh to see updated queue state.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unexpected finance review error.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="inline-form">
      <input type="hidden" name="reviewerId" value="finance.reviewer" />
      <textarea
        name="note"
        rows={3}
        placeholder={mode === "send-back" ? "Explain what information is still needed" : "Optional review note"}
        className="field-control"
      />
      <button type="submit" disabled={isPending} className={mode === "approve" ? "button-primary" : "button-secondary"}>
        {isPending ? "Submitting..." : mode === "send-back" ? "Send back" : mode[0].toUpperCase() + mode.slice(1)}
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
