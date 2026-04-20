const landingMetrics: Array<{ label: string; value: string; note: string; tone?: string }> = [
  { label: "Total cases", value: "1,284", note: "+12% monthly increase" },
  { label: "Pending approvals", value: "42", note: "8 require immediate action" },
  { label: "Completed", value: "1,120", note: "98.2% workflow closure" },
  { label: "Flagged issues", value: "03", note: "Policy discrepancies found", tone: "metric-critical" },
];

const workflowSteps = [
  { title: "Input", copy: "Receipts, invoices, screenshots, and ad-hoc requester notes." },
  { title: "AI processing", copy: "Field extraction, policy pre-checks, and clarification prompts." },
  { title: "Approval", copy: "Manager review with rationale, thresholds, and traceable decisions." },
  { title: "Finalization", copy: "Export payloads, audit logging, and recoverable exception handling." },
] as const;

const activityItems = [
  { title: "New invoice ingested", copy: "CASE-8824 from Global Logistics Ltd. for $12,400.", status: "AI processed" },
  { title: "Policy flag", copy: "Duplicate expense detected in CASE-8821. Action required.", status: "Escalated" },
  { title: "Workflow completed", copy: "Payroll cycle Q3 finalized and synced to ERP.", status: "Completed" },
  { title: "Approval granted", copy: "M. Thompson approved Travel Grant #442.", status: "Approved" },
] as const;

export default function HomePage() {
  return (
    <div className="workspace fade-up">
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="kicker">Operational overview</span>
          <h1>Automate finance workflows with audit-ready AI precision.</h1>
          <p>
            Transform unstructured financial requests into controlled, traceable operations with one system for intake,
            clarification, approvals, finance review, and export.
          </p>
          <div className="hero-actions">
            <a href="/cases/new" className="button-primary">
              Get started
            </a>
            <a href="/dashboard" className="button-secondary">
              Open dashboard
            </a>
          </div>
        </div>

        <div className="hero-visual fade-up-delay">
          <div className="hero-panel hero-panel-dark">
            <div className="metric-head">
              <div>
                <p className="eyebrow">Live orchestration</p>
                <h2>Workflow intelligence</h2>
              </div>
              <span className="inline-status">AI copilot active</span>
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
              <p className="eyebrow">Average approval time</p>
              <div className="metric-number">2.4h</div>
              <p className="muted">Decision context and AI summaries reduce review lag.</p>
            </article>
            <article className="hero-panel">
              <p className="eyebrow">AI accuracy</p>
              <div className="metric-number">99.1%</div>
              <p className="muted">OCR and workflow recommendations remain transparent and reviewable.</p>
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
            <span className="accent-copy">Real-time tracking</span>
          </div>
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
              <p className="eyebrow">Recent activity</p>
              <h2>Queue movement</h2>
            </div>
            <a href="/dashboard" className="accent-copy">
              View all
            </a>
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
            <p className="eyebrow">System health</p>
            <h2>Operational integrity stays visible from intake to export.</h2>
          </div>
          <div className="split-actions">
            <p className="muted">Neural engine operating at 99.9% precision with full audit trace continuity.</p>
            <a href="/finance-review" className="button-secondary">
              View exceptions
            </a>
          </div>
        </article>

        <article className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Decision design</p>
              <h2>Built for operators, approvers, and finance control.</h2>
            </div>
          </div>
          <div className="summary-list">
            <div className="summary-row">
              <span className="proof-label">Interpret</span>
              <p className="muted">AI extracts structure, asks only the missing questions, and preserves source context.</p>
            </div>
            <div className="summary-row">
              <span className="proof-label">Route</span>
              <p className="muted">Policies decide whether a case moves to approval, finance review, or export.</p>
            </div>
            <div className="summary-row">
              <span className="proof-label">Resolve</span>
              <p className="muted">Every downstream action is tracked as a real workflow state, not a background side effect.</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
