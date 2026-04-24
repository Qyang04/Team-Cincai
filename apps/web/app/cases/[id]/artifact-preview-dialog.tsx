"use client";

import { DEFAULT_API_BASE_URL, type CaseArtifact } from "@finance-ops/shared";
import { useCallback, useEffect, useRef, useState } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

type PreviewKind = "image" | "pdf" | "text" | "download";

function detectKind(artifact: CaseArtifact): PreviewKind {
  const mime = artifact.mimeType?.toLowerCase() ?? "";
  const name = artifact.filename.toLowerCase();
  if (
    mime.startsWith("image/") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".gif") ||
    name.endsWith(".webp")
  ) {
    return "image";
  }
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }
  if (mime.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".json")) {
    return "text";
  }
  return "download";
}

function inferKindFromBlobType(contentType: string): PreviewKind | null {
  const type = contentType.toLowerCase();
  if (type.startsWith("image/")) {
    return "image";
  }
  if (type === "application/pdf") {
    return "pdf";
  }
  if (type.startsWith("text/")) {
    return "text";
  }
  return null;
}

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; url: string; previewKind: PreviewKind }
  | { kind: "error"; message: string };

const defaultMockHeaders = {
  "x-mock-role": "ALL" as const,
  "x-mock-user-id": "artifact.preview",
};

export function ArtifactPreviewDialog({ caseId, artifact }: { caseId: string; artifact: CaseArtifact }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "idle" });

  const fileUrl = `${apiBaseUrl}/cases/${caseId}/artifacts/${artifact.id}/file`;
  const canAttempt = Boolean(artifact.storageUri?.startsWith("local://"));

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const load = useCallback(async () => {
    if (!canAttempt) {
      setFetchState({
        kind: "error",
        message: "No on-disk file for this artifact (filename-only mock). Upload a real file to preview.",
      });
      return;
    }
    setFetchState({ kind: "loading" });
    try {
      const res = await fetch(fileUrl, {
        headers: {
          ...defaultMockHeaders,
        },
      });
      if (!res.ok) {
        const message = await readErrorBody(res);
        setFetchState({ kind: "error", message });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const previewKind = inferKindFromBlobType(blob.type) ?? detectKind(artifact);
      setFetchState({ kind: "ready", url, previewKind });
    } catch (e) {
      setFetchState({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to load file",
      });
    }
  }, [artifact, canAttempt, fileUrl]);

  useEffect(() => {
    return () => {
      if (fetchState.kind === "ready") {
        URL.revokeObjectURL(fetchState.url);
      }
    };
  }, [fetchState]);

  const open = () => {
    setFetchState({ kind: "idle" });
    dialogRef.current?.showModal();
    void load();
  };

  const onDialogClose = () => {
    if (fetchState.kind === "ready") {
      URL.revokeObjectURL(fetchState.url);
    }
    setFetchState({ kind: "idle" });
  };

  return (
    <>
      <button
        type="button"
        className="artifact-filename-button"
        onClick={open}
        title="Open preview"
      >
        {artifact.filename}
      </button>

      <dialog ref={dialogRef} className="artifact-preview-dialog" onClose={onDialogClose}>
        <div className="artifact-preview-header">
          <div>
            <p className="eyebrow">Preview</p>
            <h3 className="artifact-preview-title">{artifact.filename}</h3>
            {artifact.mimeType ? <p className="muted artifact-preview-sub">{artifact.mimeType}</p> : null}
          </div>
          <button type="button" className="button-secondary" onClick={close} autoFocus>
            Close
          </button>
        </div>

        <div className="artifact-preview-body">
          {fetchState.kind === "loading" ? <p className="muted">Loading…</p> : null}
          {fetchState.kind === "error" ? <p className="text-danger">{fetchState.message}</p> : null}
          {fetchState.kind === "ready" ? (
            <PreviewContent previewKind={fetchState.previewKind} url={fetchState.url} filename={artifact.filename} />
          ) : null}
        </div>
      </dialog>
    </>
  );
}

function PreviewContent({
  previewKind,
  url,
  filename,
}: {
  previewKind: PreviewKind;
  url: string;
  filename: string;
}) {
  if (previewKind === "image") {
    return (
      <div className="artifact-preview-scroll">
        <img src={url} alt={filename} className="artifact-preview-image" />
      </div>
    );
  }
  if (previewKind === "pdf") {
    return (
      <div className="artifact-preview-pdf-wrap">
        <iframe title={`PDF: ${filename}`} src={url} className="artifact-preview-iframe" />
        <p className="muted artifact-preview-hint">Scroll inside the document to move between pages, or use the PDF toolbar.</p>
      </div>
    );
  }
  if (previewKind === "text") {
    return <TextPreview url={url} />;
  }
  return (
    <div className="artifact-preview-fallback">
      <p className="muted">Download to open this file type in an external app.</p>
      <a className="button-primary" href={url} download={filename}>
        Download
      </a>
    </div>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(url);
        const t = await r.text();
        if (!cancelled) {
          setText(t);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Read failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (err) {
    return <p className="text-danger">{err}</p>;
  }
  if (text === null) {
    return <p className="muted">Loading text…</p>;
  }
  return (
    <div className="artifact-preview-scroll artifact-preview-text">
      <pre>{text}</pre>
    </div>
  );
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[]; error?: string };
    if (Array.isArray(body.message)) {
      return body.message.join("; ");
    }
    if (typeof body.message === "string") {
      return body.message;
    }
    if (typeof body.error === "string") {
      return body.error;
    }
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}
