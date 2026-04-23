import { DEFAULT_API_BASE_URL, caseListResponseSchema, type CaseListItem } from "@finance-ops/shared";
import Link from "next/link";
import { fetchApiJson } from "../lib/server-api";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
const dashboardHeaders = {
  "x-mock-role": "ADMIN",
  "x-mock-user-id": "admin.user",
};

async function getCases(): Promise<{ cases: CaseListItem[]; isLive: boolean; errorMessage: string | null }> {
  const result = await fetchApiJson<CaseListItem[]>({
    url: `${apiBaseUrl}/cases`,
    init: {
      cache: "no-store",
      headers: dashboardHeaders,
    },
    fallbackData: [],
    resourceLabel: "Case list",
    parse: (value) => caseListResponseSchema.parse(value),
  });

  return {
    cases: result.data,
    isLive: result.ok,
    errorMessage: result.ok ? null : result.message,
  };
}

function humanizeValue(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatRelative(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (Math.abs(diffHours) < 1) {
    return "just now";
  }

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export default async function DashboardPage() {
  const { cases, isLive, errorMessage } = await getCases();
  const openCases = cases.filter((item) => item.status !== "CLOSED").length;
  const awaitingApproval = cases.filter(
    (item) => item.status === "AWAITING_APPROVAL" || item.status === "AWAITING_APPROVER_INFO_RESPONSE",
  ).length;
  const financeReview = cases.filter((item) => item.status === "FINANCE_REVIEW").length;
  const recoverableExceptions = cases.filter((item) => item.status === "RECOVERABLE_EXCEPTION").length;
  const exportReady = cases.filter((item) => item.status === "EXPORT_READY").length;
  const awaitingRequesterInfo = cases.filter((item) => item.status === "AWAITING_REQUESTER_INFO").length;
  const statusCounts = Object.entries(
    cases.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.status] = (accumulator[item.status] ?? 0) + 1;
      return accumulator;
    }, {}),
  ).sort((left, right) => right[1] - left[1]);
  const workflowCounts = Object.entries(
    cases.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.workflowType] = (accumulator[item.workflowType] ?? 0) + 1;
      return accumulator;
    }, {}),
  ).sort((left, right) => right[1] - left[1]);
  const metrics = isLive
    ? [
        { label: "Open cases", value: String(openCases), tone: "metric-neutral", note: "All non-closed cases" },
        {
          label: "Awaiting approval",
          value: String(awaitingApproval),
          tone: awaitingApproval > 0 ? "metric-attention" : "metric-neutral",
          note: "Approval queue plus approver follow-up states",
        },
        {
          label: "Finance review",
          value: String(financeReview),
          tone: financeReview > 0 ? "metric-attention" : "metric-neutral",
          note: "Cases escalated for finance handling",
        },
        {
          label: "Recoverable exceptions",
          value: String(recoverableExceptions),
          tone: recoverableExceptions > 0 ? "metric-critical" : "metric-neutral",
          note: "Retryable cases that still need operator attention",
        },
      ]
    : [
        {
          label: "Live summary",
          value: "Unavailable",
          tone: "metric-critical",
          note: `Start the API at ${apiBaseUrl} to load dashboard data.`,
        },
        { label: "Approval lane", value: "Route ready", tone: "metric-neutral", note: "Use the approvals page for action controls." },
        { label: "Finance lane", value: "Route ready", tone: "metric-neutral", note: "Use finance review for escalated cases." },
        { label: "Case detail", value: "Route ready", tone: "metric-neutral", note: "Open a case from the dashboard once data is available." },
      ];

  return (
    <div className="workspace workspace-tight fade-up">
      {!isLive && errorMessage ? (
        <div className="notice">
          <strong>Dashboard data failed to load.</strong>
          <p className="muted">
            {errorMessage} Expected API base URL: <code>{apiBaseUrl}</code>.
          </p>
        </div>
      ) : null}

      <section className="workspace-header">
        <div>
          <span className="kicker">Operational dashboard</span>
          <h1>Dashboard</h1>
          <p className="section-copy">
            Monitor the current case list, queue counts, and workflow states exposed by the API. This page avoids
            invented analytics and focuses on operator-visible status.
          </p>
        </div>
        <div className="split-actions">
          <span className={`inline-status${isLive ? " inline-status-success" : ""}`}>
            {isLive ? "Live data" : "API unavailable"}
          </span>
          <Link className="button-secondary" href="/cases/new">
            New case
          </Link>
        </div>
      </section>

      <section className="metric-strip">
        {metrics.map((metric) => (
          <article key={metric.label} className={`metric-tile ${metric.tone}`}>
            <span className="metric-label">{metric.label}</span>
            <h2>{metric.value}</h2>
            <p className="muted">{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="surface fade-up-delay">
        <div className="surface-head">
          <div>
            <p className="eyebrow">Queue summary</p>
            <h2>Current workflow checkpoints</h2>
          </div>
          <span className="inline-status">{isLive ? `${cases.length} case${cases.length === 1 ? "" : "s"}` : "No data"}</span>
        </div>
        <p className="section-copy">
          {isLive
            ? `There are ${awaitingRequesterInfo} case${awaitingRequesterInfo === 1 ? "" : "s"} awaiting requester information, ${awaitingApproval} in approval, ${financeReview} in finance review, and ${exportReady} marked export-ready.`
            : "Case summaries appear here after the dashboard can reach the API."}
        </p>
        <div className="hero-actions">
          <Link className="button-primary" href="/approvals">
            Open approvals
          </Link>
          <Link className="button-secondary" href="/finance-review">
            Open finance review
          </Link>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-chart">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Case statuses</p>
              <h2>Live workflow breakdown</h2>
            </div>
            <span className="inline-status">{statusCounts.length} visible status{statusCounts.length === 1 ? "" : "es"}</span>
          </div>
          <div className="data-list">
            {statusCounts.length ? (
              statusCounts.map(([status, count]) => (
                <div key={status} className="data-row">
                  <strong>{humanizeValue(status)}</strong>
                  <span>{count} case{count === 1 ? "" : "s"}</span>
                </div>
              ))
            ) : (
              <div className="data-row">
                <strong>No status data</strong>
                <span className="muted">The case list is empty or unavailable.</span>
              </div>
            )}
          </div>
        </article>

        <article className="dashboard-signal">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Workflow mix</p>
              <h2>Cases by workflow type</h2>
            </div>
          </div>
          <div className="signal-list">
            {workflowCounts.length ? (
              workflowCounts.map(([workflowType, count]) => (
                <div key={workflowType} className="signal-item">
                  <div className="split-line">
                    <strong>{humanizeValue(workflowType)}</strong>
                    <span>{count}</span>
                  </div>
                  <p className="muted">Live cases currently associated with this workflow.</p>
                </div>
              ))
            ) : (
              <div className="signal-item">
                <strong>No workflow data yet</strong>
                <p className="muted">Create a case to populate workflow mix on this dashboard.</p>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="surface">
        <div className="surface-head">
          <div>
            <p className="eyebrow">Recent cases</p>
            <h2>Latest case records</h2>
          </div>
          <span className="inline-status">{cases.slice(0, 5).length} shown</span>
        </div>
        <div className="data-list">
          <div className="data-row data-row-head">
            <span>Case / workflow</span>
            <span>Requester</span>
            <span>Opened</span>
            <span>Status</span>
            <span>Artifacts</span>
          </div>
          {cases.length ? (
            cases.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="data-row"
                style={{ gridTemplateColumns: "1.3fr 1fr 0.9fr 0.9fr auto" }}
              >
                <div>
                  <strong>{item.id}</strong>
                  <p className="muted">{humanizeValue(item.workflowType)}</p>
                </div>
                <span>{item.requesterId}</span>
                <span>{formatRelative(item.createdAt)}</span>
                <span className="inline-status">{humanizeValue(item.status)}</span>
                <Link href={`/cases/${item.id}`}>{item.artifacts?.length ?? 0} file{item.artifacts?.length === 1 ? "" : "s"}</Link>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div>
                <p className="eyebrow">Case list</p>
                <h2>{isLive ? "No cases to display" : "Case list unavailable"}</h2>
                <p className="muted">
                  {isLive
                    ? "Submit a case from the requester flow, then return here to review live workflow states."
                    : `Start the API at ${apiBaseUrl} to load recent cases on this dashboard.`}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
