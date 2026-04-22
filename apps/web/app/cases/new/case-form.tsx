"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const workflowOptions = [
  { value: "EXPENSE_CLAIM", label: "Expense claim" },
  { value: "PETTY_CASH_REIMBURSEMENT", label: "Petty cash reimbursement" },
  { value: "VENDOR_INVOICE_APPROVAL", label: "Vendor invoice approval" },
  { value: "INTERNAL_PAYMENT_REQUEST", label: "Internal payment request" },
] as const;

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type ExtractionPayload = {
  fields: Record<string, string | number | null | undefined>;
  confidence: number;
  provenance: Record<string, string>;
  openQuestions: string[];
};

type DecisionPayload = {
  recommendedAction: string;
  reasoningSummary: string;
  nextState: string;
  requiredApproverRole?: string;
};

type PolicyPayload = {
  passed: boolean;
  warnings: string[];
  blockingIssues: string[];
  requiresFinanceReview: boolean;
  duplicateSignals: string[];
};

type SubmissionSuccess = {
  caseId: string;
  status: string;
  extraction: ExtractionPayload;
  decision: DecisionPayload;
  policyResult: PolicyPayload | null;
};

type SubmissionState =
  | { kind: "idle" }
  | { kind: "success"; data: SubmissionSuccess }
  | { kind: "error"; error: string };

export function CaseForm() {
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setState({ kind: "idle" });

    const workflowType = String(formData.get("workflowType") ?? "EXPENSE_CLAIM");
    const requesterId = String(formData.get("requesterId") ?? "").trim() || "demo.requester";
    const notes = String(formData.get("notes") ?? "");
    const filenames = String(formData.get("filenames") ?? "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    startTransition(async () => {
      try {
        const createResponse = await fetch(`${apiBaseUrl}/cases`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mock-user-id": requesterId,
            "x-mock-role": "REQUESTER",
          },
          body: JSON.stringify({ workflowType }),
        });

        if (!createResponse.ok) {
          throw new Error(`Failed to create case (${createResponse.status}).`);
        }

        const created = await createResponse.json();
        const submitResponse = await fetch(`${apiBaseUrl}/cases/${created.id}/submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mock-user-id": requesterId,
            "x-mock-role": "REQUESTER",
          },
          body: JSON.stringify({ notes, filenames }),
        });

        if (!submitResponse.ok) {
          throw new Error(`Failed to submit case (${submitResponse.status}).`);
        }

        const submitted = await submitResponse.json();

        setState({
          kind: "success",
          data: {
            caseId: submitted.case.id,
            status: submitted.case.status,
            extraction: submitted.aiResult.extraction,
            decision: submitted.aiResult.decision,
            policyResult: submitted.policyResult ?? null,
          },
        });
      } catch (error) {
        setState({
          kind: "error",
          error: error instanceof Error ? error.message : "Unexpected error while submitting case.",
        });
      }
    });
  }

  return (
    <form action={handleSubmit} className="form-grid">
      <div className="stack-list">
        <div className="intake-dropzone">
          <div>
            <div className="dropzone-icon">AI</div>
            <strong>Stage the evidence for this request</strong>
            <p className="muted">
              Paste filenames below to simulate uploaded receipts, invoices, or screenshots. The backend will attach them
              as artifacts and run AI intake against your notes.
            </p>
          </div>
        </div>

        <div className="field-grid">
          <label className="field">
            <span className="field-label">Workflow type</span>
            <select
              name="workflowType"
              defaultValue="EXPENSE_CLAIM"
              className="field-control"
              suppressHydrationWarning
            >
              {workflowOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Requester ID</span>
            <input
              name="requesterId"
              defaultValue="demo.requester"
              className="field-control"
              suppressHydrationWarning
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">Notes</span>
          <textarea
            name="notes"
            rows={5}
            defaultValue="Please reimburse Sarah for client lunch and parking from yesterday."
            className="field-control textarea-tall"
            suppressHydrationWarning
          />
        </label>

        <label className="field">
          <span className="field-label">Artifact filenames</span>
          <textarea
            name="filenames"
            rows={4}
            defaultValue={"lunch-receipt.jpg\nparking-receipt.jpg"}
            className="field-control field-control-mono"
            placeholder="one filename per line"
            suppressHydrationWarning
          />
        </label>
      </div>

      <div className="action-row">
        <button
          type="submit"
          disabled={isPending}
          className="button-primary"
          suppressHydrationWarning
        >
          {isPending ? "Submitting..." : "Create and submit case"}
        </button>
        <button
          type="reset"
          className="button-secondary"
          suppressHydrationWarning
          onClick={() => {
            setState({ kind: "idle" });
            router.refresh();
          }}
        >
          Reset form
        </button>
      </div>

      {state.kind === "success" ? <SubmissionSummary data={state.data} /> : null}

      {state.kind === "error" ? (
        <div className="notice notice-error">
          <strong>Submission failed</strong>
          <p className="muted">{state.error}</p>
          <p className="muted">
            Confirm the API is running at <code>{apiBaseUrl}</code> and try again.
          </p>
        </div>
      ) : null}
    </form>
  );
}

function SubmissionSummary({ data }: { data: SubmissionSuccess }) {
  const extractionEntries = Object.entries(data.extraction.fields ?? {}).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  const confidencePct = Math.round((data.extraction.confidence ?? 0) * 100);
  const policy = data.policyResult;

  return (
    <div className="notice notice-success">
      <div className="surface-head" style={{ alignItems: "flex-start" }}>
        <div>
          <strong>Case created and intake complete</strong>
          <p className="muted">
            Case <code>{data.caseId}</code> is now in <strong>{data.status}</strong>.
          </p>
        </div>
        <Link className="button-primary" href={`/cases/${data.caseId}`}>
          Open case detail
        </Link>
      </div>

      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div>
          <p className="detail-label">Next step</p>
          <p>{data.decision.recommendedAction}</p>
        </div>
        <div>
          <p className="detail-label">Confidence</p>
          <p>{Number.isFinite(confidencePct) ? `${confidencePct}%` : "N/A"}</p>
        </div>
        <div>
          <p className="detail-label">Required approver</p>
          <p>{data.decision.requiredApproverRole ?? "Not yet assigned"}</p>
        </div>
        <div>
          <p className="detail-label">Open questions</p>
          <p>{data.extraction.openQuestions?.length ?? 0}</p>
        </div>
      </div>

      {data.decision.reasoningSummary ? (
        <p className="muted" style={{ marginTop: 12 }}>
          {data.decision.reasoningSummary}
        </p>
      ) : null}

      {extractionEntries.length ? (
        <>
          <p className="detail-label" style={{ marginTop: 16 }}>
            Extracted fields
          </p>
          <div className="data-list">
            {extractionEntries.map(([key, value]) => (
              <div key={key} className="data-row">
                <strong>{key}</strong>
                <span>{String(value)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {data.extraction.openQuestions?.length ? (
        <>
          <p className="detail-label" style={{ marginTop: 16 }}>
            Clarifications the AI will ask the requester
          </p>
          <ul className="muted clean-list">
            {data.extraction.openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </>
      ) : null}

      {policy ? (
        <>
          <p className="detail-label" style={{ marginTop: 16 }}>
            Policy outcome
          </p>
          <div className="detail-grid">
            <div>
              <p className="detail-label">Passed</p>
              <p>{policy.passed ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="detail-label">Requires finance review</p>
              <p>{policy.requiresFinanceReview ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="detail-label">Blocking issues</p>
              <p>{policy.blockingIssues.length}</p>
            </div>
            <div>
              <p className="detail-label">Duplicate signals</p>
              <p>{policy.duplicateSignals.length}</p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
