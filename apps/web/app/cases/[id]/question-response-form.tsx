"use client";

import { DEFAULT_API_BASE_URL, questionResponseActionResponseSchema } from "@finance-ops/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getApiBaseUrl, getClientAuthHeaders } from "../../lib/client-session";

const apiBaseUrl = getApiBaseUrl() ?? DEFAULT_API_BASE_URL;

type QuestionResponseFormProps = {
  caseId: string;
  questionId: string;
};

type Feedback = { kind: "success"; message: string } | { kind: "error"; message: string } | null;

export function QuestionResponseForm({ caseId, questionId }: QuestionResponseFormProps) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    const answer = String(formData.get("answer") ?? "").trim();
    setFeedback(null);

    if (!answer) {
      setFeedback({ kind: "error", message: "Answer cannot be empty." });
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/cases/${caseId}/questions/${questionId}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
          body: JSON.stringify({ answer }),
        });

        if (!response.ok) {
          throw new Error(`Failed to submit clarification (${response.status}).`);
        }
        const result = questionResponseActionResponseSchema.parse(await response.json());
        if (!result.success) {
          throw new Error(result.error);
        }

        setFeedback({ kind: "success", message: "Response saved. Refreshing case state..." });
        router.refresh();
      } catch (error) {
        setFeedback({
          kind: "error",
          message: error instanceof Error ? error.message : "Unexpected clarification error.",
        });
      }
    });
  }

  return (
    <form action={handleSubmit} className="inline-form">
      <textarea name="answer" rows={3} placeholder="Provide the missing clarification here" className="field-control" />
      <button type="submit" disabled={isPending} className="button-primary">
        {isPending ? "Saving..." : "Send response"}
      </button>
      {feedback ? (
        <p className={feedback.kind === "error" ? "text-danger" : "muted"}>{feedback.message}</p>
      ) : null}
    </form>
  );
}
