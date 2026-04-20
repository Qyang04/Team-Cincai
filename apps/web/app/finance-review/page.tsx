import { FinanceReviewActionForm } from "./finance-review-action-form";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

async function getFinanceReviewCases() {
  try {
    const response = await fetch(`${apiBaseUrl}/cases/finance-review/cases`, { cache: "no-store" });
    if (!response.ok) {
      return [];
    }
    return response.json();
  } catch {
    return [];
  }
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
            Threshold hits, blocking issues, and duplicate signals are surfaced here for manual control before cases move downstream.
          </p>
        </div>
      </section>

      <section className="queue-grid">
        {reviews.length ? (
          reviews.map((review: { id: string; note?: string | null; case: { id: string; workflowType: string } }) => (
            <article key={review.id} className="queue-item queue-item-critical">
              <div className="queue-summary">
                <div>
                  <p className="eyebrow">Escalated case</p>
                  <h2>{review.case.id}</h2>
                </div>
                <span className="inline-status inline-status-critical">Finance review</span>
              </div>

              <div className="decision-strip decision-strip-critical">
                <p className="detail-label">Copilot analysis</p>
                <p className="muted">{review.note ?? "Policy-directed finance review due to blocking threshold or anomaly signal."}</p>
              </div>

              <div className="detail-grid">
                <div>
                  <p className="detail-label">Workflow</p>
                  <p>{review.case.workflowType}</p>
                </div>
                <div>
                  <p className="detail-label">Recommended action</p>
                  <p>Approve, reject, or send back with required clarification.</p>
                </div>
              </div>

              <div className="action-stack">
                <FinanceReviewActionForm reviewId={review.id} mode="approve" />
                <FinanceReviewActionForm reviewId={review.id} mode="reject" />
                <FinanceReviewActionForm reviewId={review.id} mode="send-back" />
              </div>
            </article>
          ))
        ) : (
          <article className="empty-state">
            <div>
              <p className="eyebrow">Queue state</p>
              <h2>No finance review cases</h2>
              <p className="muted">When policy checks escalate a case, it will appear here with manual decision controls.</p>
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
