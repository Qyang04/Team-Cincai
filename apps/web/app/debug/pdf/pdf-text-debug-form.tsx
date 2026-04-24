"use client";

import { useMemo, useRef, useState, useTransition, type ChangeEvent } from "react";
import { postDebugFiles } from "../debug-api";

type PdfExtractionState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "success"; joinedText: string; texts: string[] }
  | { kind: "error"; error: string };

type PdfPreview = {
  key: string;
  name: string;
  sizeLabel: string;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function PdfTextDebugForm() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<PdfExtractionState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  const previews = useMemo<PdfPreview[]>(
    () =>
      files.map((file) => ({
        key: fileKey(file),
        name: file.name,
        sizeLabel: formatFileSize(file.size),
      })),
    [files],
  );

  function updateFiles(nextFiles: File[]) {
    setFiles(nextFiles);
    setState({ kind: "idle" });
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files ? Array.from(event.target.files) : [];
    updateFiles(selected);
    event.target.value = "";
  }

  function handleSubmit() {
    if (!files.length) {
      setState({ kind: "error", error: "Select at least one PDF file before running text extraction." });
      return;
    }

    setState({ kind: "running" });

    startTransition(async () => {
      try {
        const result = await postDebugFiles("pdf-text", files);
        setState({
          kind: "success",
          texts: result.texts,
          joinedText: result.joinedText,
        });
      } catch (error) {
        setState({
          kind: "error",
          error: error instanceof Error ? error.message : "Unexpected PDF extraction error.",
        });
      }
    });
  }

  function clearAll() {
    updateFiles([]);
    setState({ kind: "idle" });
  }

  return (
    <div className="form-grid">
      <div className="stack-list">
        <div
          className="intake-dropzone"
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          aria-label="Click to choose PDF files for text extraction"
          style={{ cursor: "pointer" }}
        >
          <div>
            <div className="dropzone-icon">PDF</div>
            <strong>Select one or more PDF files</strong>
            <p className="muted">
              Text extraction runs through the API and returns the detected PDF text as a comma-joined string plus
              per-file details.
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={handleFileSelection}
          />
        </div>

        <div className="action-row">
          <button type="button" className="button-primary" onClick={handleSubmit} disabled={isPending || !files.length}>
            {state.kind === "running" || isPending ? "Extracting PDF text..." : "Extract PDF text"}
          </button>
          <button type="button" className="button-secondary" onClick={clearAll} disabled={isPending}>
            Clear
          </button>
        </div>

        <div className="ocr-meta-grid">
          <div className="notice">
            <p className="detail-label">Selected PDFs</p>
            <strong>{files.length}</strong>
          </div>
          <div className="notice">
            <p className="detail-label">Joined output delimiter</p>
            <strong>Comma (,)</strong>
          </div>
        </div>
      </div>

      {files.length ? (
        <div className="ocr-preview-list">
          {previews.map((preview) => (
            <div key={preview.key} className="ocr-preview-card">
              <div className="surface-head" style={{ marginBottom: 0 }}>
                <div>
                  <p className="detail-label">PDF</p>
                  <strong>{preview.name}</strong>
                </div>
                <span className="inline-status">{preview.sizeLabel}</span>
              </div>
              <div className="pdf-debug-card-body">
                <strong>Ready for API-side text extraction</strong>
                <p className="muted">
                  Use this for text PDFs first. Scanned PDFs may still need OCR after page rendering.
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div>
            <p className="eyebrow">No PDFs staged</p>
            <h2 style={{ marginTop: 6 }}>Choose a PDF to inspect extracted text</h2>
            <p className="muted">Text-based receipts, invoices, and exported statements work best here.</p>
          </div>
        </div>
      )}

      <div className="surface">
        <div className="surface-head">
          <div>
            <p className="eyebrow">Result</p>
            <h2>Joined PDF text</h2>
          </div>
          {state.kind === "success" ? (
            <span className="inline-status inline-status-success">{state.texts.length} PDF result(s)</span>
          ) : null}
        </div>

        <div className="ocr-result-box">
          {state.kind === "idle" ? "Run PDF extraction to display the recognized text here." : null}
          {state.kind === "running" ? "The API is processing the selected PDF set..." : null}
          {state.kind === "error" ? state.error : null}
          {state.kind === "success" ? state.joinedText || "No text detected." : null}
        </div>

        {state.kind === "success" && state.texts.length ? (
          <div className="stack-list" style={{ marginTop: 16 }}>
            <p className="detail-label">Per-file extracted strings</p>
            <div className="data-list">
              {state.texts.map((text, index) => (
                <div key={`${index}:${text.slice(0, 48)}`} className="data-row data-row-stacked">
                  <strong>PDF {index + 1}</strong>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
