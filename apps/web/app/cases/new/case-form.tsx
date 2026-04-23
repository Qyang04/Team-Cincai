"use client";

import {
  caseSubmissionResponseSchema,
  createCaseResponseSchema,
  type CaseSubmissionResponse,
  type WorkflowType,
} from "@finance-ops/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ClipboardEvent, type DragEvent } from "react";

const workflowOptions: ReadonlyArray<{ value: WorkflowType; label: string }> = [
  { value: "EXPENSE_CLAIM", label: "Expense claim" },
  { value: "PETTY_CASH_REIMBURSEMENT", label: "Petty cash reimbursement" },
  { value: "VENDOR_INVOICE_APPROVAL", label: "Vendor invoice approval" },
  { value: "INTERNAL_PAYMENT_REQUEST", label: "Internal payment request" },
] as const;

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type SubmissionState =
  | { kind: "idle" }
  | { kind: "success"; data: CaseSubmissionResponse }
  | { kind: "error"; error: string };

const defaultFilenames = ["lunch-receipt.jpg", "parking-receipt.jpg"];

export function CaseForm() {
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });
  const [filenames, setFilenames] = useState<string[]>(defaultFilenames);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  function addFilenames(names: string[]) {
    const trimmed = names.map((name) => name.trim()).filter(Boolean);
    if (!trimmed.length) return;
    setFilenames((current) => {
      const seen = new Set(current);
      const merged = [...current];
      for (const name of trimmed) {
        if (!seen.has(name)) {
          seen.add(name);
          merged.push(name);
        }
      }
      return merged;
    });
  }

  function handleFilesFromList(files: FileList | null | undefined) {
    if (!files || !files.length) return;
    addFilenames(Array.from(files).map((file) => file.name));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFilesFromList(event.dataTransfer?.files);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const items = event.clipboardData?.items;
    if (!items) return;
    const names: string[] = [];
    for (const item of Array.from(items)) {
      const file = item.getAsFile?.();
      if (file) {
        names.push(file.name || `pasted-${Date.now()}.${item.type.split("/")[1] ?? "bin"}`);
      }
    }
    if (names.length) {
      event.preventDefault();
      addFilenames(names);
    }
  }

  function removeFilename(target: string) {
    setFilenames((current) => current.filter((name) => name !== target));
  }

  function handleSubmit(formData: FormData) {
    setState({ kind: "idle" });

    const workflowType = String(formData.get("workflowType") ?? "EXPENSE_CLAIM");
    const requesterId = String(formData.get("requesterId") ?? "").trim() || "demo.requester";
    const notes = String(formData.get("notes") ?? "");
    const submittedFilenames = filenames.map((name) => name.trim()).filter(Boolean);

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

        const created = createCaseResponseSchema.parse(await createResponse.json());
        const submitResponse = await fetch(`${apiBaseUrl}/cases/${created.id}/submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mock-user-id": requesterId,
            "x-mock-role": "REQUESTER",
          },
          body: JSON.stringify({ notes, filenames: submittedFilenames }),
        });

        if (!submitResponse.ok) {
          throw new Error(`Failed to submit case (${submitResponse.status}).`);
        }

        setState({
          kind: "success",
          data: caseSubmissionResponseSchema.parse(await submitResponse.json()),
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
        <div
          className="intake-dropzone"
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onPaste={handlePaste}
          style={{
            cursor: "pointer",
            outline: isDragging ? "2px dashed var(--accent)" : undefined,
            outlineOffset: isDragging ? "-6px" : undefined,
            transition: "outline 120ms ease",
          }}
          aria-label="Click, drop, or paste files to stage them for this case"
        >
          <div>
            <div className="dropzone-icon">AI</div>
            <strong>Stage the evidence for this request</strong>
            <p className="muted">
              Click to pick files, drag and drop them here, or paste (Ctrl+V) a copied file or screenshot. Only the
              filenames are sent to the backend - the mock storage layer records them as artifacts.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              handleFilesFromList(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        {filenames.length ? (
          <div className="stack-list" style={{ gap: 8 }}>
            <p className="detail-label">Staged filenames</p>
            <div className="split-actions" style={{ flexWrap: "wrap", gap: 8, justifyContent: "flex-start" }}>
              {filenames.map((name) => (
                <span
                  key={name}
                  className="inline-status"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <code>{name}</code>
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    onClick={() => removeFilename(name)}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "1rem",
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

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
          <span className="field-label">Artifact filenames (editable)</span>
          <textarea
            rows={4}
            value={filenames.join("\n")}
            onChange={(event) =>
              setFilenames(
                event.target.value
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
              )
            }
            className="field-control field-control-mono"
            placeholder="one filename per line - or drop / paste files above"
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
            setFilenames(defaultFilenames);
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

function SubmissionSummary({ data }: { data: CaseSubmissionResponse }) {
  const extractionEntries = Object.entries(data.aiResult.extraction.fields ?? {}).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  const confidencePct = Math.round((data.aiResult.extraction.confidence ?? 0) * 100);
  const policy = data.policyResult;

  return (
    <div className="notice notice-success">
      <div className="surface-head" style={{ alignItems: "flex-start" }}>
        <div>
          <strong>Case created and intake complete</strong>
          <p className="muted">
            Case <code>{data.case.id}</code> is now in <strong>{data.case.status}</strong>.
          </p>
        </div>
        <Link className="button-primary" href={`/cases/${data.case.id}`}>
          Open case detail
        </Link>
      </div>

      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div>
          <p className="detail-label">Next step</p>
          <p>{data.aiResult.decision.recommendedAction}</p>
        </div>
        <div>
          <p className="detail-label">Confidence</p>
          <p>{Number.isFinite(confidencePct) ? `${confidencePct}%` : "N/A"}</p>
        </div>
        <div>
          <p className="detail-label">Required approver</p>
          <p>{data.aiResult.decision.requiredApproverRole ?? "Not yet assigned"}</p>
        </div>
        <div>
          <p className="detail-label">Open questions</p>
          <p>{data.aiResult.extraction.openQuestions?.length ?? 0}</p>
        </div>
      </div>

      {data.aiResult.decision.reasoningSummary ? (
        <p className="muted" style={{ marginTop: 12 }}>
          {data.aiResult.decision.reasoningSummary}
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

      {data.aiResult.extraction.openQuestions?.length ? (
        <>
          <p className="detail-label" style={{ marginTop: 16 }}>
            Clarifications the AI will ask the requester
          </p>
          <ul className="muted clean-list">
            {data.aiResult.extraction.openQuestions.map((question) => (
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
