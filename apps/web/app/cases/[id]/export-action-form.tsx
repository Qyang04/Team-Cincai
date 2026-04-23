"use client";

import { exportActionResponseSchema } from "@finance-ops/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type Feedback = { kind: "success"; message: string } | { kind: "error"; message: string } | null;

export function ExportActionForm({ caseId }: { caseId: string }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/cases/${caseId}/export`, {
          method: "POST",
          headers: {
            "x-mock-role": "FINANCE_REVIEWER",
          },
        });

        if (!response.ok) {
          throw new Error(`Export failed (${response.status}).`);
        }
        const result = exportActionResponseSchema.parse(await response.json());
        if (!result.success) {
          throw new Error(result.error);
        }

        setFeedback({ kind: "success", message: "Export triggered. Refreshing case state..." });
        router.refresh();
      } catch (error) {
        setFeedback({
          kind: "error",
          message: error instanceof Error ? error.message : "Unexpected export error.",
        });
      }
    });
  }

  return (
    <div className="inline-form" style={{ marginTop: 12 }}>
      <button type="button" onClick={handleClick} disabled={isPending} className="button-primary">
        {isPending ? "Exporting..." : "Run export"}
      </button>
      {feedback ? (
        <p className={feedback.kind === "error" ? "text-danger" : "muted"}>{feedback.message}</p>
      ) : null}
    </div>
  );
}
