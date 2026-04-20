"use client";

import { useState, useTransition } from "react";

const workflowOptions = [
  { value: "EXPENSE_CLAIM", label: "Expense claim" },
  { value: "PETTY_CASH_REIMBURSEMENT", label: "Petty cash reimbursement" },
  { value: "VENDOR_INVOICE_APPROVAL", label: "Vendor invoice approval" },
  { value: "INTERNAL_PAYMENT_REQUEST", label: "Internal payment request" },
] as const;

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type SubmissionState = {
  caseId?: string;
  status?: string;
  message?: string;
  error?: string;
};

const extractedPreview = [
  { label: "Vendor", value: "CloudScale Systems" },
  { label: "Invoice date", value: "Oct 24, 2023" },
  { label: "Due date", value: "Nov 24, 2023" },
  { label: "Amount", value: "$12,450.00" },
  { label: "Currency", value: "USD" },
  { label: "Recommendation", value: "Route to IT department approval workflow" },
] as const;

export function CaseForm() {
  const [state, setState] = useState<SubmissionState>({});
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setState({});

    const workflowType = String(formData.get("workflowType") ?? "EXPENSE_CLAIM");
    const requesterId = String(formData.get("requesterId") ?? "");
    const notes = String(formData.get("notes") ?? "");
    const filenames = String(formData.get("filenames") ?? "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    startTransition(async () => {
      try {
        const createResponse = await fetch(`${apiBaseUrl}/cases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workflowType, requesterId }),
        });

        if (!createResponse.ok) {
          throw new Error("Failed to create case.");
        }

        const created = await createResponse.json();
        const submitResponse = await fetch(`${apiBaseUrl}/cases/${created.id}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes, filenames }),
        });

        if (!submitResponse.ok) {
          throw new Error("Failed to submit case.");
        }

        const submitted = await submitResponse.json();
        setState({
          caseId: submitted.case.id,
          status: submitted.case.status,
          message: submitted.aiResult.decision.reasoningSummary,
        });
      } catch (error) {
        setState({
          error: error instanceof Error ? error.message : "Unexpected error while submitting case.",
        });
      }
    });
  }

  return (
    <form action={handleSubmit} className="form-grid">
      <div className="split-panel">
        <div className="stack-list">
          <div className="intake-dropzone">
            <div>
              <div className="dropzone-icon">AI</div>
              <strong>Drag and stage the request evidence here</strong>
              <p className="muted">
                Use the filenames field below to simulate uploaded invoices, receipts, or screenshots for the current workflow.
              </p>
            </div>
          </div>

          <div className="field-grid">
            <label className="field">
              <span className="field-label">Workflow type</span>
              <select name="workflowType" defaultValue="EXPENSE_CLAIM" className="field-control">
                {workflowOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Requester ID</span>
              <input name="requesterId" defaultValue="demo.requester" className="field-control" />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Notes</span>
            <textarea
              name="notes"
              rows={5}
              defaultValue="Please reimburse Sarah for client lunch and parking from yesterday."
              className="field-control textarea-tall"
            />
          </label>

          <label className="field">
            <span className="field-label">Artifact filenames</span>
            <textarea
              name="filenames"
              rows={4}
              defaultValue={"lunch-receipt.jpg\nparking-receipt.jpg"}
              className="field-control field-control-mono"
            />
          </label>
        </div>

        <aside className="stack-list">
          <div className="surface" style={{ padding: 18 }}>
            <p className="eyebrow">Manual entry</p>
            <p className="muted">Paste raw request context or extracted text fragments for AI analysis.</p>
            <textarea
              readOnly
              value="Enter invoice details or paste text content..."
              className="field-control textarea-tall"
            />
          </div>

          <div className="surface" style={{ padding: 18 }}>
            <div className="surface-head">
              <div>
                <p className="eyebrow">Extracted preview</p>
                <h2>Simulated analysis</h2>
              </div>
              <span className="inline-status">High confidence</span>
            </div>
            <div className="preview-canvas">
              <div className="preview-sheet" />
            </div>
            <div className="detail-grid" style={{ marginTop: 16 }}>
              {extractedPreview.slice(0, 5).map((item) => (
                <div key={item.label}>
                  <p className="detail-label">{item.label}</p>
                  <p>{item.value}</p>
                </div>
              ))}
            </div>
            <div className="recommendation-box">
              <p className="detail-label">AI recommendation</p>
              <p className="muted">{extractedPreview[5].value}</p>
            </div>
          </div>
        </aside>
      </div>

      <div className="action-row">
        <button type="submit" disabled={isPending} className="button-primary">
          {isPending ? "Submitting..." : "Create and submit case"}
        </button>
        <button type="reset" className="button-secondary">
          Reset form
        </button>
      </div>

      {state.message ? (
        <div className="notice notice-success">
          <strong>Submission complete</strong>
          <p className="muted">Case ID: {state.caseId}</p>
          <p className="muted">Current status: {state.status}</p>
          <p className="muted">{state.message}</p>
        </div>
      ) : null}

      {state.error ? (
        <div className="notice notice-error">
          <strong>Submission failed</strong>
          <p className="muted">{state.error}</p>
        </div>
      ) : null}
    </form>
  );
}
