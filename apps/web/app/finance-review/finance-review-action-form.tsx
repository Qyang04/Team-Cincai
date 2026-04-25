"use client";

import { DEFAULT_API_BASE_URL, financeReviewActionResponseSchema } from "@finance-ops/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getApiBaseUrl, getClientAuthHeaders } from "../lib/client-session";

const apiBaseUrl = getApiBaseUrl() ?? DEFAULT_API_BASE_URL;

type Mode = "approve" | "reject" | "send-back" | "assign";

type Feedback = { kind: "success"; message: string } | { kind: "error"; message: string } | null;

function FieldHint({ hint }: { hint: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        marginLeft: 6,
      }}
    >
      <button
        type="button"
        className="field-hint-trigger"
        aria-label="Show field hint"
        aria-expanded={isOpen}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onClick={() => setIsOpen((current) => !current)}
        style={{
          width: 18,
          height: 18,
          borderRadius: "999px",
          border: "1px solid var(--border-color, #c5ccd5)",
          background: "var(--panel-muted, #f6f8fb)",
          color: "var(--text-muted, #4b5563)",
          fontSize: 12,
          lineHeight: "16px",
          fontWeight: 700,
          cursor: "help",
          padding: 0,
        }}
      >
        i
      </button>
      <span
        className="field-hint-popover"
        role="tooltip"
        style={{
          position: "absolute",
          left: 0,
          top: "calc(100% + 6px)",
          width: 260,
          background: "var(--panel-bg, #ffffff)",
          border: "1px solid var(--border-color, #d6dce3)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
          padding: "8px 10px",
          fontSize: 12,
          lineHeight: 1.45,
          color: "var(--text-secondary, #1f2937)",
          zIndex: 20,
          opacity: isOpen ? 1 : 0,
          visibility: isOpen ? "visible" : "hidden",
          transform: isOpen ? "translateY(0)" : "translateY(-2px)",
          transition: "opacity 120ms ease, transform 120ms ease, visibility 120ms ease",
          pointerEvents: isOpen ? "auto" : "none",
        }}
      >
        {hint}
      </span>
    </span>
  );
}

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
        <span className="field-label">
          Owner (work assignment)
          <FieldHint hint="Choose who should actively handle this review item." />
        </span>
        <input name="ownerId" placeholder="Assign to finance reviewer ID" className="field-control" suppressHydrationWarning />
      </label>

      <label className="field">
        <span className="field-label">
          Reason category
          <FieldHint hint="Pick the main reason this case needs finance review: Policy block, Reconciliation, Coding, Risk, Missing support, or Other." />
        </span>
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
        <span className="field-label">
          Coding decision
          <FieldHint hint="Record how this should be handled: Approve as-is, Reclassify, Split entry, or Hold." />
        </span>
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
          <span className="field-label">
            Reconciliation status
            <FieldHint hint="Matched means figures align, Adjusted means you corrected the amount, Unresolved means it still does not tie out." />
          </span>
          <select name="reconciliationStatus" className="field-control" defaultValue="">
            <option value="">No reconciliation decision</option>
            <option value="MATCHED">Matched</option>
            <option value="ADJUSTED">Adjusted</option>
            <option value="UNRESOLVED">Unresolved</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">
            Reconciled amount
            <FieldHint hint="Enter the final confirmed amount after reconciliation, especially if status is Adjusted." />
          </span>
          <input name="reconciledAmount" type="number" step="0.01" min={0} className="field-control" />
        </label>
      </div>

      <label className="field">
        <span className="field-label">
          Reconciled currency
          <FieldHint hint="Currency code for the reconciled amount, for example MYR." />
        </span>
        <input name="reconciledCurrency" placeholder="MYR" className="field-control" />
      </label>

      <label className="field">
        <span className="field-label">
          Finance annotation
          <FieldHint hint="Internal finance context: what you reviewed, key evidence, and concerns for follow-up." />
        </span>
        <textarea
          name="annotation"
          rows={2}
          placeholder="Capture finance-specific notes (coding intent, reconciliation evidence, risk context)."
          className="field-control"
          suppressHydrationWarning
        />
      </label>

      <label className="field">
        <span className="field-label">
          Review note
          <FieldHint hint="Write a clear decision explanation. Required when sending back so requester knows what to provide." />
        </span>
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
