import { DEFAULT_API_BASE_URL } from "@finance-ops/shared";
import Link from "next/link";
import { fetchApiJson } from "./lib/server-api";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
const dashboardHeaders = {
  "x-mock-role": "ADMIN",
  "x-mock-user-id": "admin.user",
};

type CaseListItem = {
  id: string;
  workflowType: string;
  status: string;
  priority: string;
  requesterId: string;
  createdAt: string;
  artifacts?: Array<{ id: string }>;
};

const workflowSteps = [
  { title: "Input", copy: "Receipts, invoices, screenshots, and ad-hoc requester notes." },
  { title: "AI processing", copy: "Field extraction, policy pre-checks, and clarification prompts." },
  { title: "Approval", copy: "Manager review with rationale, thresholds, and traceable decisions." },
  { title: "Finalization", copy: "Export payloads, audit logging, and recoverable exception handling." },
] as const;

async function getCases(): Promise<{ cases: CaseListItem[]; isLive: boolean; errorMessage: string | null }> {
  const result = await fetchApiJson<CaseListItem[]>({
    url: `${apiBaseUrl}/cases`,
    init: {
      cache: "no-store",
      headers: dashboardHeaders,
    },
    fallbackData: [],
    resourceLabel: "Case list",
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

export default async function HomePage() {
  const { cases, isLive, errorMessage } = await getCases();
  const recentCases = cases.slice(0, 4);
  const activeCases = cases.filter((item) => item.status !== "CLOSED").length;
  const awaitingRequesterInfo = cases.filter((item) => item.status === "AWAITING_REQUESTER_INFO").length;
  const awaitingApproval = cases.filter(
    (item) => item.status === "AWAITING_APPROVAL" || item.status === "AWAITING_APPROVER_INFO_RESPONSE",
  ).length;
  const financeReview = cases.filter((item) => item.status === "FINANCE_REVIEW").length;
  const exportReady = cases.filter((item) => item.status === "EXPORT_READY").length;
  const landingMetrics: Array<{ label: string; value: string; note: string; tone?: string }> = isLive
    ? [
        { label: "Total cases", value: String(cases.length), note: "Live count from the current case list" },
        { label: "Active cases", value: String(activeCases), note: "Cases still moving through the workflow" },
        { label: "Awaiting approval", value: String(awaitingApproval), note: "Includes approver follow-up states" },
        {
          label: "Finance review",
          value: String(financeReview),
          note: exportReady
            ? `${exportReady} case${exportReady === 1 ? "" : "s"} already marked export-ready`
            : "No cases are currently marked export-ready",
          tone: financeReview > 0 ? "metric-critical" : undefined,
        },
      ]
    : [
        { label: "Case data", value: "Unavailable", note: errorMessage ?? `Start the API at ${apiBaseUrl} to load live summaries.` },
        { label: "Dashboard", value: "Ready", note: "Navigation works, but route summaries depend on live API data." },
        { label: "Approvals", value: "Live route", note: "Use the approval lane for real action handling." },
        { label: "Finance review", value: "Live route", note: "Use the finance review queue for escalated cases." },
      ];

  return (
    <div className="workspace fade-up">
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="kicker">Operational overview</span>
          <h1>Run finance requests through one visible workflow.</h1>
          <p>
            This workspace is strongest when used as a case-driven demo: submit a request, inspect the case detail,
            route through approval or finance review, and keep the audit trail visible end to end.
          </p>
          <p className="muted">
            The hero and case summaries are based on live API data when available. The workflow pipeline below is illustrative.
          </p>
          <div className="hero-actions">
            <Link href="/cases/new" className="button-primary">
              Create case
            </Link>
            <Link href="/dashboard" className="button-secondary">
              Open dashboard
            </Link>
          </div>
        </div>

        <div className="hero-visual fade-up-delay">
          <div className="hero-panel hero-panel-dark">
            <div className="metric-head">
              <div>
                <p className="eyebrow">Live orchestration</p>
                <h2>Current case activity</h2>
              </div>
              <span className={`inline-status${isLive ? " inline-status-success" : ""}`}>
                {isLive ? "Live data" : "API unavailable"}
              </span>
            </div>
            <div className="hero-flow">
              {recentCases.length ? (
                recentCases.map((item) => (
                  <div key={item.id} className="hero-flow-row">
                    <strong>{humanizeValue(item.workflowType)}</strong>
                    <span className="muted">{humanizeValue(item.status)}</span>
                  </div>
                ))
              ) : (
                <div className="hero-flow-row">
                  <strong>{isLive ? "No cases yet" : "Case feed unavailable"}</strong>
                  <span className="muted">
                    {isLive
                      ? "Create a case to populate the live workflow summary."
                      : `Start the API at ${apiBaseUrl} to populate the live workflow summary.`}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="hero-metrics">
            <article className="hero-panel">
              <p className="eyebrow">Awaiting requester info</p>
              <div className="metric-number">{isLive ? awaitingRequesterInfo : "0"}</div>
              <p className="muted">Cases paused for clarification before routing can continue.</p>
            </article>
            <article className="hero-panel">
              <p className="eyebrow">Recent cases</p>
              <div className="metric-number">{isLive ? recentCases.length : "0"}</div>
              <p className="muted">The overview reflects the latest cases returned by the API.</p>
            </article>
          </div>
        </div>
      </section>

      {!isLive && errorMessage ? (
        <section className="notice">
          <strong>Live dashboard data failed to load.</strong>
          <p className="muted">
            {errorMessage} Expected API base URL: <code>{apiBaseUrl}</code>.
          </p>
        </section>
      ) : null}

      <section className="landing-summary">
        {landingMetrics.map((metric) => (
          <article key={metric.label} className={`metric-tile ${metric.tone ?? ""}`}>
            <span className="metric-label">{metric.label}</span>
            <h2>{metric.value}</h2>
            <p className="muted">{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="support-grid">
        <article className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Intelligent pipeline</p>
              <h2>One operating model across every finance lane.</h2>
            </div>
            <span className="accent-copy">Sample tracking</span>
          </div>
          <p className="muted">The workflow model below represents the intended process flow and is not a live event stream.</p>
          <div className="workflow-track">
            {workflowSteps.map((step, index) => (
              <div key={step.title} className="track-step">
                <span className="lane-index">{`0${index + 1}`}</span>
                <strong>{step.title}</strong>
                <p className="muted">{step.copy}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="activity-panel">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Recent cases</p>
              <h2>Latest queue movement</h2>
            </div>
            <Link href="/dashboard" className="accent-copy">
              View all
            </Link>
          </div>
          <div className="activity-list">
            {recentCases.length ? (
              recentCases.map((item) => (
                <div key={item.id} className="activity-row">
                  <strong>{humanizeValue(item.workflowType)}</strong>
                  <p className="muted">
                    Case {item.id} opened by {item.requesterId} {formatRelative(item.createdAt)}.
                  </p>
                  <span className="inline-status">{humanizeValue(item.status)}</span>
                </div>
              ))
            ) : (
              <div className="activity-row">
                <strong>{isLive ? "No live cases yet" : "Recent cases unavailable"}</strong>
                <p className="muted">
                  {isLive
                    ? "Submit a case to replace this placeholder state with recent workflow activity."
                    : `The landing page could not load the case list from ${apiBaseUrl}.`}
                </p>
                <span className="inline-status">{isLive ? "Empty queue" : "API unavailable"}</span>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="support-grid">
        <article className="poster-panel">
          <div>
            <p className="eyebrow">Current scope</p>
            <h2>The demo is strongest when it shows real queues, real case states, and clear handoffs.</h2>
          </div>
          <div className="split-actions">
            <p className="muted">
              Landing and dashboard now summarize only what the current API exposes, without invented analytics or
              unwired automation claims.
            </p>
            <Link href="/finance-review" className="button-secondary">
              Open finance review
            </Link>
          </div>
        </article>

        <article className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">What to check</p>
              <h2>Operator-ready paths to verify in the demo.</h2>
            </div>
          </div>
          <div className="summary-list">
            <div className="summary-row">
              <span className="proof-label">Submit</span>
              <p className="muted">Create a case from the requester flow and confirm it appears on the dashboard.</p>
            </div>
            <div className="summary-row">
              <span className="proof-label">Route</span>
              <p className="muted">Check whether the case moves into requester clarification, approval, or finance review.</p>
            </div>
            <div className="summary-row">
              <span className="proof-label">Resolve</span>
              <p className="muted">Open case detail and verify the audit trail and final workflow status remain visible.</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
