"use client";

import { useState, useTransition } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type QuestionResponseFormProps = {
  caseId: string;
  questionId: string;
};

export function QuestionResponseForm({ caseId, questionId }: QuestionResponseFormProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    const answer = String(formData.get("answer") ?? "");
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/cases/${caseId}/questions/${questionId}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer }),
        });

        if (!response.ok) {
          throw new Error("Failed to submit clarification response.");
        }

        setMessage("Response saved. Refresh the page to see updated status.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unexpected clarification error.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="inline-form">
      <textarea name="answer" rows={3} placeholder="Provide the missing clarification here" className="field-control" />
      <button type="submit" disabled={isPending} className="button-primary">
        {isPending ? "Saving..." : "Send response"}
      </button>
      {message ? (
        <p className="muted">
          {message}
        </p>
      ) : null}
    </form>
  );
}
