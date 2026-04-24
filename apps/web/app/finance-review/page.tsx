import {
  DEFAULT_API_BASE_URL,
  financeReviewAnalyticsSummarySchema,
  financeReviewQueueResponseSchema,
  type FinanceReviewAnalyticsSummary,
  type FinanceReviewQueueItem,
} from "@finance-ops/shared";
import Link from "next/link";
import { getServerAuthHeaders } from "../lib/session";
import { fetchApiJson } from "../lib/server-api";
import { FinanceReviewActionForm } from "./finance-review-action-form";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

async function getFinanceReviewCases(): Promise<{ reviews: FinanceReviewQueueItem[]; errorMessage: string | null }> {
  const headers = await getServerAuthHeaders();
  const result = await fetchApiJson<FinanceReviewQueueItem[]>({
    url: `${apiBaseUrl}/cases/finance-review/cases`,
    init: {
      cache: "no-store",
      headers,
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

async function getFinanceReviewAnalytics(): Promise<FinanceReviewAnalyticsSummary | null> {
  const headers = await getServerAuthHeaders();
  const result = await fetchApiJson<FinanceReviewAnalyticsSummary | null>({
    url: `${apiBaseUrl}/cases/finance-review/analytics`,
    init: {
      cache: "no-store",
      headers,
    },
    fallbackData: null,
    resourceLabel: "Finance review analytics",
    parse: (value) => financeReviewAnalyticsSummarySchema.parse(value),
  });
  return result.ok ? result.data : null;
}

function humanizeWorkflow(workflowType: string): string {
  return workflowType
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (char) => char.toUpperCase());
}

export default async function FinanceReviewPage() {
  const { reviews, errorMessage } = await getFinanceReviewCases();
  const analytics = await getFinanceReviewAnalytics();

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
          {analytics ? (
            <>
              <span className="inline-status">
                Throughput {analytics.approvedLast7d} approved / {analytics.rejectedLast7d} rejected (7d)
              </span>
              <span className="inline-status">Sent-back follow-up {analytics.sentBackOpenReviews}</span>
              <span className="inline-status">Unassigned open {analytics.unassignedOpenReviews}</span>
              <span className="inline-status">
                Avg resolution {analytics.avgResolutionHours !== null ? `${analytics.avgResolutionHours.toFixed(1)}h` : "N/A"}
              </span>
            </>
          ) : null}
        </div>
      </section>

      {analytics ? (
        <section className="metric-strip">
          <article className="metric-tile">
            <p className="metric-label">Open finance reviews</p>
            <h2>{analytics.openReviews}</h2>
            <p className="muted">Includes active and sent-back follow-up</p>
          </article>
          <article className="metric-tile">
            <p className="metric-label">Sent-back follow-up</p>
            <h2>{analytics.sentBackOpenReviews}</h2>
            <p className="muted">Requester clarification loops still visible</p>
          </article>
          <article className="metric-tile metric-attention">
            <p className="metric-label">Unassigned open</p>
            <h2>{analytics.unassignedOpenReviews}</h2>
            <p className="muted">Reviews missing owner or reviewer</p>
          </article>
          <article className="metric-tile metric-critical">
            <p className="metric-label">7d throughput</p>
            <h2>{analytics.approvedLast7d + analytics.rejectedLast7d}</h2>
            <p className="muted">
              {analytics.approvedLast7d} approved / {analytics.rejectedLast7d} rejected
            </p>
          </article>
        </section>
      ) : null}

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
