const metrics = [
  { label: "Open cases", value: "24", tone: "metric-neutral", note: "Across all active workflow lanes" },
  { label: "Awaiting approval", value: "7", tone: "metric-attention", note: "2 require immediate action" },
  { label: "Finance review", value: "3", tone: "metric-warning", note: "Threshold or anomaly escalation" },
  { label: "Recoverable exceptions", value: "1", tone: "metric-critical", note: "Retry path available" },
] as const;

const chartBars = [
  { day: "Mon", height: 84, soft: false },
  { day: "Tue", height: 52, soft: false },
  { day: "Wed", height: 106, soft: false },
  { day: "Thu", height: 38, soft: false },
  { day: "Fri", height: 106, soft: true },
  { day: "Sat", height: 24, soft: false },
  { day: "Sun", height: 30, soft: false },
] as const;

const workflowSignals = [
  { title: "Payroll processing", progress: "82%", note: "Processing 142 records" },
  { title: "Tax compliance audit", progress: "35%", note: "3 missing files require action" },
  { title: "Vendor onboarding", progress: "100%", note: "Completed 2h ago" },
] as const;

const transactions = [
  { entity: "Amazon Web Services", category: "Cloud infrastructure", date: "Sep 24, 2024", status: "Healthy", amount: "-$4,290.00" },
  { entity: "Marcus Chen", category: "Contractor", date: "Sep 22, 2024", status: "Requires action", amount: "-$2,800.00" },
  { entity: "Global Logistics Inc.", category: "Shipping", date: "Sep 21, 2024", status: "Processing", amount: "-$1,150.00" },
] as const;

export default function DashboardPage() {
  return (
    <div className="workspace workspace-tight fade-up">
      <section className="workspace-header">
        <div>
          <span className="kicker">Financial command center</span>
          <h1>Dashboard</h1>
          <p className="section-copy">Monitor case throughput, approval response, and downstream workflow health in one workspace.</p>
        </div>
        <div className="split-actions">
          <span className="inline-status inline-status-success">Healthy</span>
          <button className="button-secondary" type="button">
            Export report
          </button>
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
            <p className="eyebrow">Copilot insight</p>
            <h2>Cash flow surplus predicted for October.</h2>
          </div>
          <span className="inline-status">Auto processed</span>
        </div>
        <p className="section-copy">
          Based on current accounts receivable and project milestones, the system anticipates a 14% increase in
          liquidity and suggests reallocating reserve capacity into active operating spend.
        </p>
        <div className="hero-actions">
          <button className="button-primary" type="button">
            Apply recommendation
          </button>
          <button className="button-secondary" type="button">
            View analysis
          </button>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-chart">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Cash flow velocity</p>
              <h2>Rolling 7-day transaction volume</h2>
            </div>
            <div className="metric-inline">
              <span className="inline-status">Inbound</span>
              <span className="inline-status">Outbound</span>
            </div>
          </div>
          <div className="chart-bars" aria-hidden="true">
            {chartBars.map((bar) => (
              <div key={bar.day} className={`chart-bar${bar.soft ? " chart-bar-soft" : ""}`}>
                <div className="chart-fill" style={{ height: `${bar.height}%` }} />
                <span className="accent-copy">{bar.day}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-signal">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Active workflows</p>
              <h2>Current movement</h2>
            </div>
          </div>
          <div className="signal-list">
            {workflowSignals.map((signal) => (
              <div key={signal.title} className="signal-item">
                <div className="split-line">
                  <strong>{signal.title}</strong>
                  <span>{signal.progress}</span>
                </div>
                <p className="muted">{signal.note}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="surface">
        <div className="surface-head">
          <div>
            <p className="eyebrow">Recent transactions</p>
            <h2>Operational ledger</h2>
          </div>
          <span className="inline-status">All categories</span>
        </div>
        <div className="data-list">
          <div className="data-row data-row-head">
            <span>Entity / transaction</span>
            <span>Category</span>
            <span>Date</span>
            <span>Status</span>
            <span>Amount</span>
          </div>
          {transactions.map((transaction) => (
            <div
              key={`${transaction.entity}-${transaction.date}`}
              className="data-row"
              style={{ gridTemplateColumns: "1.3fr 1fr 0.9fr 0.9fr auto" }}
            >
              <strong>{transaction.entity}</strong>
              <span>{transaction.category}</span>
              <span>{transaction.date}</span>
              <span className="inline-status">{transaction.status}</span>
              <strong>{transaction.amount}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
