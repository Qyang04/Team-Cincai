import { DEFAULT_API_BASE_URL, caseListResponseSchema, type CaseListItem } from "@finance-ops/shared";
import Link from "next/link";
import { getServerAuthHeaders, getServerSession } from "../lib/session";
import { fetchApiJson } from "../lib/server-api";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

async function getCases(): Promise<{ cases: CaseListItem[]; isLive: boolean; errorMessage: string | null }> {
  const headers = await getServerAuthHeaders();
  const result = await fetchApiJson<CaseListItem[]>({
    url: `${apiBaseUrl}/cases`,
    init: {
      cache: "no-store",
      headers,
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
  const session = await getServerSession();
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
  const myActionCases = cases.filter((item) => item.needsMyAction);
  const ownedCases = session ? cases.filter((item) => item.assignedTo === session.user.id) : [];
  const intakeCases = cases.filter((item) =>
    item.status === "DRAFT" ||
    item.status === "SUBMITTED" ||
    item.status === "INTAKE_PROCESSING" ||
    item.status === "AWAITING_REQUESTER_INFO" ||
    item.status === "POLICY_REVIEW" ||
    item.status === "AWAITING_APPROVER_INFO_RESPONSE",
  );

  const metrics = isLive
    ? [
        { label: "Open cases", value: String(openCases), tone: "metric-neutral", note: "All non-closed cases" },
        {
          label: "Needs my action",
          value: String(myActionCases.length),
          tone: myActionCases.length > 0 ? "metric-attention" : "metric-neutral",
          note: "Cases currently waiting on your lane",
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
          note: "We could not load dashboard data right now. Please try again shortly.",
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
          <p className="muted">{errorMessage}</p>
        </div>
      ) : null}

      <section className="workspace-header">
        <div>
          <span className="kicker">Operational dashboard</span>
          <h1>Dashboard</h1>
          <p className="section-copy">
            Monitor the current case list, queue counts, and workflow states exposed by the API. This page now doubles
            as an inbox for active claim and case management work.
          </p>
          {session ? (
            <p className="muted">
              Signed in as <strong>{session.user.displayName}</strong>. This view is scoped to the cases your current
              role can access.
            </p>
          ) : null}
        </div>
        <div className="split-actions">
          <span className={`inline-status${isLive ? " inline-status-success" : ""}`}>
            {isLive ? "Up to date" : "Data temporarily unavailable"}
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
            : "Case summaries appear here once data is available again."}
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
        <article className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Needs attention</p>
              <h2>My next actions</h2>
            </div>
            <span className="inline-status">{myActionCases.length}</span>
          </div>
          <div className="signal-list">
            {myActionCases.length ? (
              myActionCases.slice(0, 5).map((item) => (
                <div key={item.id} className="signal-item">
                  <div className="split-line">
                    <strong>{item.id}</strong>
                    <span>{humanizeValue(item.status)}</span>
                  </div>
                  <p className="muted">
                    {item.recommendedAction ? humanizeValue(item.recommendedAction) : "Review this case"} |{" "}
                    {item.artifactSummary?.summary ?? "No evidence summary"}
                  </p>
                  <Link href={`/cases/${item.id}`}>Open case</Link>
                </div>
              ))
            ) : (
              <div className="signal-item">
                <strong>No immediate actions</strong>
                <p className="muted">Nothing in your visible workload is waiting on you right now.</p>
              </div>
            )}
          </div>
        </article>

        <article className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Ownership</p>
              <h2>Cases assigned to me</h2>
            </div>
            <span className="inline-status">{ownedCases.length}</span>
          </div>
          <div className="signal-list">
            {ownedCases.length ? (
              ownedCases.slice(0, 5).map((item) => (
                <div key={item.id} className="signal-item">
                  <div className="split-line">
                    <strong>{humanizeValue(item.workflowType)}</strong>
                    <span>{humanizeValue(item.status)}</span>
                  </div>
                  <p className="muted">{item.artifactSummary?.summary ?? "No evidence summary available."}</p>
                  <Link href={`/cases/${item.id}`}>Inspect case</Link>
                </div>
              ))
            ) : (
              <div className="signal-item">
                <strong>No owned cases</strong>
                <p className="muted">Assignments will appear here as work moves through the workflow.</p>
              </div>
            )}
          </div>
        </article>
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
            <p className="eyebrow">Intake lane</p>
            <h2>Cases still in claim and case management</h2>
          </div>
          <span className="inline-status">{intakeCases.length}</span>
        </div>
        <div className="data-list">
          <div className="data-row data-row-head">
            <span>Case</span>
            <span>Owner</span>
            <span>Status</span>
            <span>Evidence</span>
            <span>Action</span>
          </div>
          {intakeCases.length ? (
            intakeCases.slice(0, 6).map((item) => (
              <div key={item.id} className="data-row" style={{ gridTemplateColumns: "1.1fr 1fr 0.9fr 1.2fr auto" }}>
                <div>
                  <strong>{item.id}</strong>
                  <p className="muted">{humanizeValue(item.workflowType)}</p>
                </div>
                <span>{item.assignedTo ?? "Unassigned"}</span>
                <span className="inline-status">{humanizeValue(item.status)}</span>
                <span>{item.artifactSummary?.summary ?? "No evidence"}</span>
                <Link href={`/cases/${item.id}`}>{item.needsMyAction ? "Act now" : "View"}</Link>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div>
                <p className="eyebrow">Intake lane</p>
                <h2>No intake-stage cases visible</h2>
                <p className="muted">New drafts, clarification loops, and policy-ready cases will appear here.</p>
              </div>
            </div>
          )}
        </div>
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
            <span>Owner</span>
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
                <span>{item.assignedTo ?? item.requesterId}</span>
                <span>{formatRelative(item.createdAt)}</span>
                <span className="inline-status">{humanizeValue(item.status)}</span>
                <Link href={`/cases/${item.id}`}>
                  {item.artifactSummary?.total ?? item.artifacts?.length ?? 0} file
                  {(item.artifactSummary?.total ?? item.artifacts?.length ?? 0) === 1 ? "" : "s"}
                </Link>
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
                    : "We could not load recent cases right now. Please try again shortly."}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
