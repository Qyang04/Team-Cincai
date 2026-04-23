import Link from "next/link";

const workflowSteps = [
  { title: "Input", copy: "Receipts, invoices, screenshots, and ad-hoc requester notes." },
  { title: "AI processing", copy: "Field extraction, policy pre-checks, and clarification prompts." },
  { title: "Approval", copy: "Manager review with rationale, thresholds, and traceable decisions." },
  { title: "Finalization", copy: "Export payloads, audit logging, and recoverable exception handling." },
] as const;

const landingMetrics: Array<{ label: string; value: string; note: string; tone?: string }> = [
  { label: "Case intake", value: "Live route", note: "Submit a new request from the requester flow." },
  { label: "Approval lane", value: "Live route", note: "Review manager decisions and follow-up questions." },
  { label: "Finance review", value: "Live route", note: "Resolve escalations before export." },
  { label: "Audit trail", value: "Visible", note: "Inspect state transitions on each case detail page." },
];

const activityItems = [
  { title: "Submit a new case", copy: "Start from the requester flow and attach example evidence.", status: "Requester" },
  { title: "Review routing", copy: "Use the dashboard and case detail views to confirm the chosen workflow state.", status: "Operations" },
  { title: "Approve or escalate", copy: "Move the case through approval or finance review with recorded rationale.", status: "Control" },
  { title: "Export and verify", copy: "Confirm the final state and export handoff remain visible in the audit trail.", status: "Completion" },
] as const;

export default function HomePage() {
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
            This overview is intentionally static. Use the dashboard and queue routes for live runtime data.
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
                <p className="eyebrow">Demo workflow</p>
                <h2>Case-driven operating model</h2>
              </div>
              <span className="inline-status">Sample path</span>
            </div>
            <div className="hero-flow">
              <div className="hero-flow-row">
                <strong>Expense claim</strong>
                <span className="muted">Clarification in progress</span>
              </div>
              <div className="hero-flow-row">
                <strong>Vendor invoice</strong>
                <span className="muted">Approval ready</span>
              </div>
              <div className="hero-flow-row">
                <strong>Internal payment</strong>
                <span className="muted">Finance review triggered</span>
              </div>
              <div className="hero-flow-row">
                <strong>Petty cash</strong>
                <span className="muted">Export payload prepared</span>
              </div>
            </div>
          </div>

          <div className="hero-metrics">
            <article className="hero-panel">
              <p className="eyebrow">Requester flow</p>
              <div className="metric-number">1</div>
              <p className="muted">Create a case, upload evidence, and submit into the workflow.</p>
            </article>
            <article className="hero-panel">
              <p className="eyebrow">Operator views</p>
              <div className="metric-number">3</div>
              <p className="muted">Dashboard, approvals, and finance review cover the live control surface.</p>
            </article>
          </div>
        </div>
      </section>

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
              <p className="eyebrow">Suggested walkthrough</p>
              <h2>How to inspect the live system</h2>
            </div>
            <Link href="/dashboard" className="accent-copy">
              Open dashboard
            </Link>
          </div>
          <div className="activity-list">
            {activityItems.map((item) => (
              <div key={item.title} className="activity-row">
                <strong>{item.title}</strong>
                <p className="muted">{item.copy}</p>
                <span className="inline-status">{item.status}</span>
              </div>
            ))}
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
