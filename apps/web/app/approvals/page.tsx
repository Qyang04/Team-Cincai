import { ApprovalActionForm } from "./approval-action-form";

const sidebarNotes = [
  "Contract compliance and vendor history are visible before the approver acts.",
  "Decision rationale is captured in-line so the approval trail remains reviewable.",
  "Escalation stays available for cases that need finance intervention instead of immediate judgment.",
] as const;

async function getApprovalTasks() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

  try {
    const response = await fetch(`${apiBaseUrl}/cases/approvals/tasks`, { cache: "no-store" });
    if (!response.ok) {
      return [];
    }
    return response.json();
  } catch {
    return [];
  }
}

export default async function ApprovalsPage() {
  const tasks = await getApprovalTasks();

  return (
    <div className="workspace workspace-tight fade-up">
      <section className="workspace-header">
        <div>
          <span className="kicker">Approval lane</span>
          <h1>Pending approvals</h1>
          <p className="section-copy">
            Review cases requiring SME oversight. AI has pre-processed the request context so decisions stay fast and auditable.
          </p>
        </div>
        <div className="split-actions">
          <button className="button-secondary" type="button">
            Filter
          </button>
          <button className="button-primary" type="button">
            Export batch
          </button>
        </div>
      </section>

      <section className="approval-layout">
        <div className="queue-grid" style={{ gridTemplateColumns: "1fr" }}>
          {tasks.length ? (
            tasks.map(
              (
                task: { id: string; approverId: string; case: { id: string; workflowType: string } },
                index: number,
              ) => (
              <article key={task.id} className={`queue-item approval-card ${index === 0 ? "queue-highlight" : ""}`}>
                <div className="approval-topline">
                  <div>
                    <p className="eyebrow">Case {task.case.id}</p>
                    <h2>{task.case.workflowType.replaceAll("_", " ")}</h2>
                  </div>
                  <div className="stack-list" style={{ justifyItems: "end" }}>
                    <span className="inline-status inline-status-attention">Approval required</span>
                    <strong>{task.approverId}</strong>
                  </div>
                </div>

                <div className="decision-strip">
                  <p className="detail-label">AI reasoning summary</p>
                  <p className="muted">
                    Policy review passed, evidence appears complete, and the case is ready for manager judgment with rationale capture.
                  </p>
                </div>

                <div className="detail-grid">
                  <div>
                    <p className="detail-label">Workflow</p>
                    <p>{task.case.workflowType}</p>
                  </div>
                  <div>
                    <p className="detail-label">Assigned approver</p>
                    <p>{task.approverId}</p>
                  </div>
                </div>

                <div className="action-stack">
                  <ApprovalActionForm taskId={task.id} mode="approve" />
                  <ApprovalActionForm taskId={task.id} mode="reject" />
                  <ApprovalActionForm taskId={task.id} mode="request-info" />
                </div>
              </article>
              ),
            )
          ) : (
            <article className="empty-state">
              <div>
                <p className="eyebrow">Queue state</p>
                <h2>No pending approvals</h2>
                <p className="muted">Once policy review clears a case, it will appear here with decision controls attached.</p>
              </div>
            </article>
          )}
        </div>

        <aside className="stack-list">
          <article className="sidebar-note">
            <p className="eyebrow">Reasoning summary</p>
            <h2>What the approver sees first</h2>
            <div className="insight-list">
              {sidebarNotes.map((note) => (
                <div key={note} className="insight-item">
                  <p className="muted">{note}</p>
                </div>
              ))}
            </div>
            <div className="case-summary-grid" style={{ marginTop: 16 }}>
              <div className="metric-tile metric-neutral">
                <span className="metric-label">Real-time savings</span>
                <div className="metric-number">$42,104</div>
              </div>
              <div className="metric-tile metric-neutral">
                <span className="metric-label">Avg. approval time</span>
                <div className="metric-number">2.4h</div>
              </div>
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
