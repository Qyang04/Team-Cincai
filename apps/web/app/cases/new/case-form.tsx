"use client";

import {
  DEFAULT_API_BASE_URL,
  caseSubmissionResponseSchema,
  createCaseResponseSchema,
  type CaseSubmissionResponse,
  type WorkflowType,
} from "@finance-ops/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ClipboardEvent, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { getApiBaseUrl, getClientAuthHeaders } from "../../lib/client-session";

const workflowOptions: ReadonlyArray<{ value: WorkflowType; label: string }> = [
  { value: "EXPENSE_CLAIM", label: "Expense claim" },
  { value: "PETTY_CASH_REIMBURSEMENT", label: "Petty cash reimbursement" },
  { value: "VENDOR_INVOICE_APPROVAL", label: "Vendor invoice approval" },
  { value: "INTERNAL_PAYMENT_REQUEST", label: "Internal payment request" },
] as const;

const apiBaseUrl = getApiBaseUrl() ?? DEFAULT_API_BASE_URL;

type SubmissionState =
  | { kind: "idle" }
  | { kind: "success"; data: CaseSubmissionResponse }
  | { kind: "error"; error: string };

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

async function readHttpErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) {
      return body.message.join("; ");
    }
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function isReuploadRequiredErrorMessage(message: string): boolean {
  return /Submission blocked: one or more files could not be read reliably/i.test(message);
}

export function CaseForm() {
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });
  const [notes, setNotes] = useState("Please reimburse Sarah for client lunch and parking from yesterday.");
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropzoneRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const requiresFreshUpload =
    state.kind === "error" && isReuploadRequiredErrorMessage(state.error);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!requiresFreshUpload) {
      return;
    }
    setShowUploadDialog(true);
    dropzoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    fileInputRef.current?.focus();
  }, [requiresFreshUpload]);

  useEffect(() => {
    if (state.kind === "error") {
      setShowErrorDialog(true);
    }
  }, [state]);

  function addStagedFiles(files: File[]) {
    if (!files.length) return;
    setStagedFiles((current) => {
      const seen = new Set(current.map(fileKey));
      const merged = [...current];
      for (const file of files) {
        const key = fileKey(file);
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(file);
        }
      }
      return merged;
    });
  }

  function handleFilesFromList(files: FileList | null | undefined) {
    if (!files || !files.length) return;
    addStagedFiles(Array.from(files));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFilesFromList(event.dataTransfer?.files);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const items = event.clipboardData?.items;
    if (!items) return;
    const pasted: File[] = [];
    for (const item of Array.from(items)) {
      const file = item.getAsFile?.();
      if (file) {
        pasted.push(file);
      }
    }
    if (pasted.length) {
      event.preventDefault();
      addStagedFiles(pasted);
    }
  }

  function removeStagedFile(target: File) {
    const key = fileKey(target);
    setStagedFiles((current) => current.filter((file) => fileKey(file) !== key));
  }

  function handleSubmit(formData: FormData) {
    setState({ kind: "idle" });

    const workflowType = String(formData.get("workflowType") ?? "EXPENSE_CLAIM");
    const submittedNotes = String(formData.get("notes") ?? "");
    const filesToUpload = [...stagedFiles];

    startTransition(async () => {
      try {
        if (requiresFreshUpload && !filesToUpload.length) {
          throw new Error(
            "A fresh uploaded file is required before resubmitting this case. Please upload a clearer receipt or document.",
          );
        }
        if (!filesToUpload.length) {
          throw new Error("Add at least one real file to upload before submitting.");
        }

        const createResponse = await fetch(`${apiBaseUrl}/cases`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getClientAuthHeaders(),
          },
          body: JSON.stringify({ workflowType }),
        });

        if (!createResponse.ok) {
          throw new Error(
            await readHttpErrorMessage(createResponse, `Failed to create case (${createResponse.status}).`),
          );
        }

        const created = createCaseResponseSchema.parse(await createResponse.json());

        const authHeaders = getClientAuthHeaders();

        for (const file of filesToUpload) {
          const uploadBody = new FormData();
          uploadBody.append("file", file);
          const uploadResponse = await fetch(`${apiBaseUrl}/cases/${created.id}/artifacts/upload`, {
            method: "POST",
            headers: { ...authHeaders },
            body: uploadBody,
          });
          if (!uploadResponse.ok) {
            throw new Error(
              await readHttpErrorMessage(
                uploadResponse,
                `Failed to upload "${file.name}" (${uploadResponse.status}).`,
              ),
            );
          }
        }

        const submitResponse = await fetch(`${apiBaseUrl}/cases/${created.id}/submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({ notes: submittedNotes }),
        });

        if (!submitResponse.ok) {
          throw new Error(await readHttpErrorMessage(submitResponse, `Failed to submit case (${submitResponse.status}).`));
        }

        setState({
          kind: "success",
          data: caseSubmissionResponseSchema.parse(await submitResponse.json()),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unexpected error while submitting case.";
        setState({
          kind: "error",
          error: errorMessage,
        });
      }
    });
  }

  return (
    <form action={handleSubmit} className="form-grid">
      {hasMounted && showUploadDialog
        ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="File needs re-upload"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            className="surface"
            style={{
              width: "min(560px, 100%)",
              border: "1px solid #fecaca",
              boxShadow: "0 12px 40px rgba(15, 23, 42, 0.22)",
              minHeight: "auto",
              height: "auto",
            }}
          >
            <p className="eyebrow">Upload required</p>
            <h3 style={{ marginTop: 0 }}>File could not be read clearly</h3>
            <p className="muted">
              This submission is blocked because at least one file could not be extracted reliably. Please upload a
              clearer file before trying again.
            </p>
            <div className="split-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  setShowUploadDialog(false);
                  fileInputRef.current?.click();
                }}
              >
                Choose clearer file
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setShowUploadDialog(false)}
              >
                I will do this now
              </button>
            </div>
          </div>
        </div>,
            document.body,
          )
        : null}
      {hasMounted && showErrorDialog && state.kind === "error"
        ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Submission error"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
            padding: 16,
          }}
        >
          <div
            className="surface"
            style={{
              width: "min(520px, 100%)",
              border: "1px solid #fecaca",
              boxShadow: "0 12px 40px rgba(15, 23, 42, 0.22)",
              minHeight: "auto",
              height: "auto",
            }}
          >
            <p className="eyebrow">Submission failed</p>
            <h3 style={{ marginTop: 0 }}>
              {requiresFreshUpload ? "We couldn't read your file clearly" : "Unable to submit case"}
            </h3>
            {requiresFreshUpload ? (
              <div className="stack-list" style={{ gap: 10 }}>
                <p className="muted" style={{ margin: 0 }}>
                  No worries - your case details are still here. Please upload a clearer image/file, then submit again.
                </p>
              </div>
            ) : (
              <p className="muted">{state.error}</p>
            )}
            <div className="split-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="button-primary"
                onClick={() => setShowErrorDialog(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>,
            document.body,
          )
        : null}
      <div className="stack-list">
        <div
          ref={dropzoneRef}
          className="intake-dropzone"
          role="button"
          tabIndex={0}
          suppressHydrationWarning
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
            outline: requiresFreshUpload
              ? "2px solid #dc2626"
              : isDragging
                ? "2px dashed var(--accent)"
                : undefined,
            outlineOffset: isDragging ? "-6px" : undefined,
            transition: "outline 120ms ease",
          }}
          aria-label="Click, drop, or paste files to stage them for this case"
        >
          <div>
            <div className="dropzone-icon">AI</div>
            <strong>Stage the evidence for this request</strong>
            <p className="muted">
              Click, drag and drop, or paste (Ctrl+V) real files. Each file is uploaded to the API and stored under{" "}
              <code>.local-artifacts/</code> on the server (see <code>LOCAL_ARTIFACT_DIR</code>).
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
        {requiresFreshUpload ? (
          <p className="text-danger" style={{ margin: 0 }}>
            Upload is required: this case is blocked until you attach a newly uploaded, clearer file.
          </p>
        ) : null}

        {stagedFiles.length ? (
          <div className="stack-list" style={{ gap: 8 }}>
            <p className="detail-label">Staged files (full upload on submit)</p>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              Submit sends each file&apos;s bytes to the API where they are stored on disk and OCR-processed before AI intake.
            </p>
            <div className="split-actions" style={{ flexWrap: "wrap", gap: 8, justifyContent: "flex-start" }}>
              {stagedFiles.map((file) => (
                <span
                  key={fileKey(file)}
                  className="inline-status"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <code>{file.name}</code>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    ({formatFileSize(file.size)})
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeStagedFile(file)}
                    suppressHydrationWarning
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
        </div>

        <label className="field">
          <span className="field-label">Notes</span>
          <textarea
            name="notes"
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="field-control textarea-tall"
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
            setNotes("Please reimburse Sarah for client lunch and parking from yesterday.");
            setStagedFiles([]);
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
