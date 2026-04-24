"use client";

import { DEFAULT_API_BASE_URL, financeReviewActionResponseSchema } from "@finance-ops/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getApiBaseUrl, getClientAuthHeaders } from "../lib/client-session";

const apiBaseUrl = getApiBaseUrl() ?? DEFAULT_API_BASE_URL;

type Mode = "approve" | "reject" | "send-back" | "assign";

type Feedback = { kind: "success"; message: string } | { kind: "error"; message: string } | null;

export function FinanceReviewActionForm({ reviewId }: { reviewId: string }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(mode: Mode, formData: FormData) {
    setFeedback(null);
    setPendingMode(mode);

    const note = String(formData.get("note") ?? "").trim();
    const ownerId = String(formData.get("ownerId") ?? "").trim();
    const reasonCategory = String(formData.get("reasonCategory") ?? "").trim();
    const codingDecision = String(formData.get("codingDecision") ?? "").trim();
    const reconciliationStatus = String(formData.get("reconciliationStatus") ?? "").trim();
    const reconciledAmountRaw = String(formData.get("reconciledAmount") ?? "").trim();
    const reconciledAmount = reconciledAmountRaw.length ? Number(reconciledAmountRaw) : undefined;
    const reconciledCurrency = String(formData.get("reconciledCurrency") ?? "").trim();
    const annotation = String(formData.get("annotation") ?? "").trim();

    if (mode === "send-back" && !note) {
      setFeedback({ kind: "error", message: "Explain what information is still needed before sending back." });
      setPendingMode(null);
      return;
    }
    if (mode === "assign" && !ownerId) {
      setFeedback({ kind: "error", message: "Provide an owner ID before assigning." });
      setPendingMode(null);
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/cases/finance-review/${reviewId}/${mode}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getClientAuthHeaders(),
          },
          body: JSON.stringify(
            mode === "assign"
              ? { ownerId }
              : {
                  ownerId: ownerId || undefined,
                  reasonCategory: reasonCategory || undefined,
                  codingDecision: codingDecision || undefined,
                  reconciliationStatus: reconciliationStatus || undefined,
                  reconciledAmount:
                    reconciledAmount !== undefined && Number.isFinite(reconciledAmount) ? reconciledAmount : undefined,
                  reconciledCurrency: reconciledCurrency || undefined,
                  annotation: annotation || undefined,
                  note: note || undefined,
                },
          ),
        });

        if (!response.ok) {
          throw new Error(`Finance review action failed (${response.status}).`);
        }
        const result = financeReviewActionResponseSchema.parse(await response.json());
        if (!result.success) {
          throw new Error(result.error);
        }

        const successMessage =
          mode === "assign"
            ? "Assigned. Review ownership updated."
            :
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
        <span className="field-label">Owner (work assignment)</span>
        <input name="ownerId" placeholder="Assign to finance reviewer ID" className="field-control" suppressHydrationWarning />
      </label>

      <label className="field">
        <span className="field-label">Reason category</span>
        <select name="reasonCategory" className="field-control" defaultValue="">
          <option value="">Select category</option>
          <option value="POLICY_BLOCK">Policy block</option>
          <option value="RECONCILIATION">Reconciliation</option>
          <option value="CODING">Coding</option>
          <option value="RISK">Risk</option>
          <option value="MISSING_SUPPORT">Missing support</option>
          <option value="OTHER">Other</option>
        </select>
      </label>

      <label className="field">
        <span className="field-label">Coding decision</span>
        <select name="codingDecision" className="field-control" defaultValue="">
          <option value="">No coding decision</option>
          <option value="APPROVE_AS_IS">Approve as-is</option>
          <option value="RECLASSIFY">Reclassify</option>
          <option value="SPLIT">Split entry</option>
          <option value="HOLD">Hold</option>
        </select>
      </label>

      <div className="field-grid">
        <label className="field">
          <span className="field-label">Reconciliation status</span>
          <select name="reconciliationStatus" className="field-control" defaultValue="">
            <option value="">No reconciliation decision</option>
            <option value="MATCHED">Matched</option>
            <option value="ADJUSTED">Adjusted</option>
            <option value="UNRESOLVED">Unresolved</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Reconciled amount</span>
          <input name="reconciledAmount" type="number" step="0.01" min={0} className="field-control" />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Reconciled currency</span>
        <input name="reconciledCurrency" placeholder="MYR" className="field-control" />
      </label>

      <label className="field">
        <span className="field-label">Finance annotation</span>
        <textarea
          name="annotation"
          rows={2}
          placeholder="Capture finance-specific notes (coding intent, reconciliation evidence, risk context)."
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
          className="button-secondary"
          disabled={isPending}
          onClick={(event) => submit("assign", new FormData(event.currentTarget.form ?? undefined))}
          suppressHydrationWarning
        >
          {isPending && pendingMode === "assign" ? "Assigning..." : "Assign owner"}
        </button>
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
