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
import { useRef, useState, useTransition, type ClipboardEvent, type DragEvent } from "react";

const workflowOptions: ReadonlyArray<{ value: WorkflowType; label: string }> = [
  { value: "EXPENSE_CLAIM", label: "Expense claim" },
  { value: "PETTY_CASH_REIMBURSEMENT", label: "Petty cash reimbursement" },
  { value: "VENDOR_INVOICE_APPROVAL", label: "Vendor invoice approval" },
  { value: "INTERNAL_PAYMENT_REQUEST", label: "Internal payment request" },
] as const;

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

type SubmissionState =
  | { kind: "idle" }
  | { kind: "success"; data: CaseSubmissionResponse }
  | { kind: "error"; error: string };

const defaultFilenames = ["lunch-receipt.jpg", "parking-receipt.jpg"];

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

export function CaseForm() {
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });
  const [filenames, setFilenames] = useState<string[]>(defaultFilenames);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
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

  function removeFilename(target: string) {
    setFilenames((current) => current.filter((name) => name !== target));
  }

  function removeStagedFile(target: File) {
    const key = fileKey(target);
    setStagedFiles((current) => current.filter((file) => fileKey(file) !== key));
  }

  function handleSubmit(formData: FormData) {
    setState({ kind: "idle" });

    const workflowType = String(formData.get("workflowType") ?? "EXPENSE_CLAIM");
    const requesterId = String(formData.get("requesterId") ?? "").trim() || "demo.requester";
    const notes = String(formData.get("notes") ?? "");
    const submittedFilenames = filenames.map((name) => name.trim()).filter(Boolean);
    const filesToUpload = [...stagedFiles];

    startTransition(async () => {
      try {
        if (!filesToUpload.length && !submittedFilenames.length) {
          throw new Error("Add at least one file to upload, or enter mock artifact filenames (one per line).");
        }

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
          throw new Error(
            await readHttpErrorMessage(createResponse, `Failed to create case (${createResponse.status}).`),
          );
        }

        const created = createCaseResponseSchema.parse(await createResponse.json());

        const authHeaders = {
          "x-mock-user-id": requesterId,
          "x-mock-role": "REQUESTER",
        } as const;

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
          body: JSON.stringify({
            notes,
            filenames: filesToUpload.length ? [] : submittedFilenames,
          }),
        });

        if (!submitResponse.ok) {
          throw new Error(await readHttpErrorMessage(submitResponse, `Failed to submit case (${submitResponse.status}).`));
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
              Click, drag and drop, or paste (Ctrl+V) real files. Each file is uploaded to the API and stored under{" "}
              <code>.local-artifacts/</code> on the server (see <code>LOCAL_ARTIFACT_DIR</code>). If you do not add
              files, you can still use mock-only mode with the filename list below.
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

        {stagedFiles.length ? (
          <div className="stack-list" style={{ gap: 8 }}>
            <p className="detail-label">Staged files (full upload on submit)</p>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              While files are listed here, submit sends their bytes to the API. The filename-only box is ignored until you
              remove every staged file.
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

        {!stagedFiles.length && filenames.length ? (
          <div className="stack-list" style={{ gap: 8 }}>
            <p className="detail-label">Mock artifact names (no binary upload)</p>
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
          <span className="field-label">Mock-only filenames (one per line, when no files staged)</span>
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
            placeholder="Used only if you submit without staging files above"
            disabled={stagedFiles.length > 0}
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
