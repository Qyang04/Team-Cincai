"use client";

import { DEFAULT_API_BASE_URL } from "@finance-ops/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getApiBaseUrl, getClientAuthHeaders } from "../../lib/client-session";

const apiBaseUrl = getApiBaseUrl() ?? DEFAULT_API_BASE_URL;

type Feedback =
  | { kind: "idle" }
  | { kind: "error"; message: string };

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[]; error?: string };
    if (Array.isArray(body.message)) {
      return body.message.join("; ");
    }
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    /* ignore */
  }
  return `Retry failed (${response.status}).`;
}

export function ArtifactRetryForm({ caseId, artifactId }: { caseId: string; artifactId: string }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  return (
    <div className="stack-list" style={{ gap: 8 }}>
      <button
        type="button"
        className="button-secondary"
        disabled={isPending}
        onClick={() => {
          setFeedback({ kind: "idle" });
          startTransition(async () => {
            const response = await fetch(`${apiBaseUrl}/cases/${caseId}/artifacts/process`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...getClientAuthHeaders(),
              },
              body: JSON.stringify({ artifactId }),
            });

            if (!response.ok) {
              setFeedback({ kind: "error", message: await readErrorMessage(response) });
              return;
            }

            router.refresh();
          });
        }}
      >
        {isPending ? "Retrying..." : "Retry processing"}
      </button>
      {feedback.kind === "error" ? <p className="text-danger">{feedback.message}</p> : null}
    </div>
  );
}
