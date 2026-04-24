import { DEFAULT_API_BASE_URL, financeReviewQueueResponseSchema, type FinanceReviewQueueItem } from "@finance-ops/shared";
import Link from "next/link";
import { fetchApiJson } from "../lib/server-api";
import { FinanceReviewActionForm } from "./finance-review-action-form";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

async function getFinanceReviewCases(): Promise<{ reviews: FinanceReviewQueueItem[]; errorMessage: string | null }> {
  const result = await fetchApiJson<FinanceReviewQueueItem[]>({
    url: `${apiBaseUrl}/cases/finance-review/cases`,
    init: {
      cache: "no-store",
      headers: {
        "x-mock-role": "FINANCE_REVIEWER",
        "x-mock-user-id": "finance.reviewer",
      },
    },
    fallbackData: [],
    resourceLabel: "Finance review queue",
    parse: (value) => financeReviewQueueResponseSchema.parse(value),
  });

  return {
    reviews: result.data,
    errorMessage: result.ok ? null : result.message,
  };
}

function humanizeWorkflow(workflowType: string): string {
  return workflowType
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (char) => char.toUpperCase());
}

export default async function FinanceReviewPage() {
  const { reviews, errorMessage } = await getFinanceReviewCases();

  return (
    <div className="workspace workspace-tight fade-up">
      {errorMessage ? (
        <div className="notice">
          <strong>Finance review queue failed to load.</strong>
          <p className="muted">
            {errorMessage} Expected API base URL: <code>{apiBaseUrl}</code>.
          </p>
        </div>
      ) : null}

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
                    Requested by {review.case.requesterId} - opened {new Date(review.case.createdAt).toLocaleString()}
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
                <div>
                  <p className="detail-label">Work owner</p>
                  <p>{review.ownerId ?? "Unassigned"}</p>
                </div>
                <div>
                  <p className="detail-label">Reason category</p>
                  <p>{review.reasonCategory ?? "Not categorized"}</p>
                </div>
                <div>
                  <p className="detail-label">Coding decision</p>
                  <p>{review.codingDecision ?? "No decision"}</p>
                </div>
                <div>
                  <p className="detail-label">Reconciliation</p>
                  <p>
                    {review.reconciliationStatus ?? "Not set"}
                    {review.reconciledAmount !== undefined && review.reconciledAmount !== null
                      ? ` | ${review.reconciledAmount}${review.reconciledCurrency ? ` ${review.reconciledCurrency}` : ""}`
                      : ""}
                  </p>
                </div>
              </div>

              {review.annotation ? (
                <div className="notice">
                  <p className="detail-label">Finance annotation</p>
                  <p className="muted">{review.annotation}</p>
                </div>
              ) : null}

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
                {errorMessage
                  ? errorMessage
                  : `If you expected a case, confirm the API is running at ${apiBaseUrl} and that policy routed it to FINANCE_REVIEW.`}
              </p>
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
