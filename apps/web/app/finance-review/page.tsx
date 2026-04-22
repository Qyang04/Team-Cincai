import Link from "next/link";
import { FinanceReviewActionForm } from "./finance-review-action-form";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type FinanceReview = {
  id: string;
  note?: string | null;
  outcome?: string | null;
  reviewerId?: string | null;
  createdAt: string;
  updatedAt: string;
  case: {
    id: string;
    workflowType: string;
    status: string;
    priority: string;
    requesterId: string;
    createdAt: string;
  };
};

async function getFinanceReviewCases(): Promise<FinanceReview[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/cases/finance-review/cases`, {
      cache: "no-store",
      headers: {
        "x-mock-role": "FINANCE_REVIEWER",
        "x-mock-user-id": "finance.reviewer",
      },
    });
    if (!response.ok) {
      return [];
    }
    return response.json();
  } catch {
    return [];
  }
}

function humanizeWorkflow(workflowType: string): string {
  return workflowType
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (char) => char.toUpperCase());
}

export default async function FinanceReviewPage() {
  const reviews = await getFinanceReviewCases();

  return (
    <div className="workspace workspace-tight fade-up">
      <section className="workspace-header">
        <div>
          <span className="kicker">Exception lane</span>
          <h1>Finance review queue</h1>
          <p className="section-copy">
            Threshold hits, blocking issues, duplicate signals, and reconciliation concerns surface here for manual
            resolution before cases continue.
          </p>
        </div>
        <div className="split-actions">
          <span className="inline-status">
            {reviews.length} open review{reviews.length === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      <section className="queue-grid">
        {reviews.length ? (
          reviews.map((review) => (
            <article key={review.id} className="queue-item queue-item-critical">
              <div className="queue-summary">
                <div>
                  <p className="eyebrow">Case {review.case.id}</p>
                  <h2>{humanizeWorkflow(review.case.workflowType)}</h2>
                  <p className="muted">
                    Requested by {review.case.requesterId} · opened{" "}
                    {new Date(review.case.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="stack-list" style={{ justifyItems: "end" }}>
                  <span className="inline-status inline-status-critical">Finance review</span>
                  <span className="inline-status">Priority {review.case.priority}</span>
                  <span className="inline-status">Case status {review.case.status}</span>
                </div>
              </div>

              {review.note ? (
                <div className="decision-strip decision-strip-critical">
                  <p className="detail-label">Review reason</p>
                  <p className="muted">{review.note}</p>
                </div>
              ) : null}

              <div className="detail-grid">
                <div>
                  <p className="detail-label">Review opened</p>
                  <p>{new Date(review.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="detail-label">Assigned reviewer</p>
                  <p>{review.reviewerId ?? "Unassigned"}</p>
                </div>
              </div>

              <div className="split-actions" style={{ marginTop: 8 }}>
                <Link className="button-secondary" href={`/cases/${review.case.id}`}>
                  Open case detail
                </Link>
              </div>

              <FinanceReviewActionForm reviewId={review.id} />
            </article>
          ))
        ) : (
          <article className="empty-state">
            <div>
              <p className="eyebrow">Queue state</p>
              <h2>No finance review cases</h2>
              <p className="muted">
                When policy escalates a case to finance review, it will appear here with manual decision controls.
              </p>
              <p className="muted">
                If you expected a case, confirm the API is running at <code>{apiBaseUrl}</code> and that policy routed
                it to <code>FINANCE_REVIEW</code>.
              </p>
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
