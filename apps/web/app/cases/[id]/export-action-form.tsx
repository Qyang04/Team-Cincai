"use client";

import { useState, useTransition } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export function ExportActionForm({ caseId }: { caseId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/cases/${caseId}/export`, {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Export failed.");
        }

        setMessage("Export triggered. Refresh to see the updated case status.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unexpected export error.");
      }
    });
  }

  return (
    <div className="inline-form">
      <button type="button" onClick={handleClick} disabled={isPending} className="button-primary">
        {isPending ? "Exporting..." : "Run export"}
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
