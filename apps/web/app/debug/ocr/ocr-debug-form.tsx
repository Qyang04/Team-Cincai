"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent } from "react";
import { TesseractOcrService } from "../../lib/ocr";

type OcrState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "success"; joinedText: string; texts: string[] }
  | { kind: "error"; error: string };

type PreviewImage = {
  key: string;
  name: string;
  sizeLabel: string;
  url: string;
};

const ocrService = new TesseractOcrService();

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

export function OcrDebugForm() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<OcrState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  const previews = useMemo<PreviewImage[]>(
    () =>
      files.map((file) => ({
        key: fileKey(file),
        name: file.name,
        sizeLabel: formatFileSize(file.size),
        url: URL.createObjectURL(file),
      })),
    [files],
  );

  useEffect(() => {
    return () => {
      for (const preview of previews) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [previews]);

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
      setState({ kind: "error", error: "Select at least one image file before running OCR." });
      return;
    }

    setState({ kind: "running" });

    startTransition(async () => {
      try {
        const texts = await ocrService.extractStrings(files);
        setState({
          kind: "success",
          texts,
          joinedText: texts.join(","),
        });
      } catch (error) {
        setState({
          kind: "error",
          error: error instanceof Error ? error.message : "Unexpected OCR error.",
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
          aria-label="Click to choose images for OCR"
          style={{ cursor: "pointer" }}
        >
          <div>
            <div className="dropzone-icon">OCR</div>
            <strong>Select one or more images</strong>
            <p className="muted">
              The images stay in your browser session. OCR runs locally using Tesseract and returns a comma-joined text
              string.
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={handleFileSelection}
          />
        </div>

        <div className="action-row">
          <button type="button" className="button-primary" onClick={handleSubmit} disabled={isPending || !files.length}>
            {state.kind === "running" || isPending ? "Running OCR..." : "Run OCR"}
          </button>
          <button type="button" className="button-secondary" onClick={clearAll} disabled={isPending}>
            Clear
          </button>
        </div>

        <div className="ocr-meta-grid">
          <div className="notice">
            <p className="detail-label">Selected images</p>
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
                  <p className="detail-label">Image</p>
                  <strong>{preview.name}</strong>
                </div>
                <span className="inline-status">{preview.sizeLabel}</span>
              </div>
              <Image
                src={preview.url}
                alt={preview.name}
                width={1200}
                height={1600}
                unoptimized
                style={{ width: "100%", height: "auto" }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div>
            <p className="eyebrow">No images staged</p>
            <h2 style={{ marginTop: 6 }}>Choose an image to inspect OCR output</h2>
            <p className="muted">Receipt screenshots, invoice scans, and photographed documents all work here.</p>
          </div>
        </div>
      )}

      <div className="surface">
        <div className="surface-head">
          <div>
            <p className="eyebrow">Result</p>
            <h2>Joined OCR text</h2>
          </div>
          {state.kind === "success" ? (
            <span className="inline-status inline-status-success">{state.texts.length} image result(s)</span>
          ) : null}
        </div>

        <div className="ocr-result-box">
          {state.kind === "idle" ? "Run OCR to display the recognized text here." : null}
          {state.kind === "running" ? "Tesseract is processing the selected image set..." : null}
          {state.kind === "error" ? state.error : null}
          {state.kind === "success" ? state.joinedText || "No text detected." : null}
        </div>

        {state.kind === "success" && state.texts.length ? (
          <div className="stack-list" style={{ marginTop: 16 }}>
            <p className="detail-label">Per-image OCR strings</p>
            <div className="data-list">
              {state.texts.map((text, index) => (
                <div key={`${index}:${text}`} className="data-row">
                  <strong>Image {index + 1}</strong>
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
