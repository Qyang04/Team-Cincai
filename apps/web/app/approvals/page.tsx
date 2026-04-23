import { DEFAULT_API_BASE_URL, approvalQueueResponseSchema, type ApprovalQueueItem } from "@finance-ops/shared";
import Link from "next/link";
import { fetchApiJson } from "../lib/server-api";
import { ApprovalActionForm } from "./approval-action-form";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

async function getApprovalTasks(): Promise<{ tasks: ApprovalQueueItem[]; errorMessage: string | null }> {
  const result = await fetchApiJson<ApprovalQueueItem[]>({
    url: `${apiBaseUrl}/cases/approvals/tasks`,
    init: {
      cache: "no-store",
      headers: {
        "x-mock-role": "APPROVER",
        "x-mock-user-id": "manager.approver",
      },
    },
    fallbackData: [],
    resourceLabel: "Approval queue",
    parse: (value) => approvalQueueResponseSchema.parse(value),
  });

  return {
    tasks: result.data,
    errorMessage: result.ok ? null : result.message,
  };
}

function humanizeWorkflow(workflowType: string): string {
  return workflowType
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatRelative(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (Math.abs(diffHours) < 1) return "just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export default async function ApprovalsPage() {
  const { tasks, errorMessage } = await getApprovalTasks();

  return (
    <div className="workspace workspace-tight fade-up">
      {errorMessage ? (
        <div className="notice">
          <strong>Approval queue failed to load.</strong>
          <p className="muted">
            {errorMessage} Expected API base URL: <code>{apiBaseUrl}</code>.
          </p>
        </div>
      ) : null}

      <section className="workspace-header">
        <div>
          <span className="kicker">Approval lane</span>
          <h1>Pending approvals</h1>
          <p className="section-copy">
            Review cases routed by policy. Each decision is captured in the audit trail with rationale.
          </p>
        </div>
        <div className="split-actions">
          <span className="inline-status">
            {tasks.length} pending task{tasks.length === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      <section className="queue-grid" style={{ gridTemplateColumns: "1fr" }}>
        {tasks.length ? (
          tasks.map((task, index) => (
            <article
              key={task.id}
              className={`queue-item approval-card ${index === 0 ? "queue-highlight" : ""}`}
            >
              <div className="approval-topline">
                <div>
                  <p className="eyebrow">Case {task.case.id}</p>
                  <h2>{humanizeWorkflow(task.case.workflowType)}</h2>
                  <p className="muted">
                    Requested by {task.case.requesterId} - opened {formatRelative(task.case.createdAt)}
                  </p>
                </div>
                <div className="stack-list" style={{ justifyItems: "end" }}>
                  <span className="inline-status inline-status-attention">Approval required</span>
                  <span className="inline-status">Priority {task.case.priority}</span>
                  <span className="inline-status">Case status {task.case.status}</span>
                </div>
              </div>

              <div className="detail-grid">
                <div>
                  <p className="detail-label">Assigned approver</p>
                  <p>{task.approverId}</p>
                </div>
                <div>
                  <p className="detail-label">Task opened</p>
                  <p>{new Date(task.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="detail-label">Due</p>
                  <p>{task.dueAt ? new Date(task.dueAt).toLocaleString() : "No due date"}</p>
                </div>
                <div>
                  <p className="detail-label">Task status</p>
                  <p>{task.status}</p>
                </div>
              </div>

              <div className="split-actions" style={{ marginTop: 8 }}>
                <Link className="button-secondary" href={`/cases/${task.case.id}`}>
                  Open case detail
                </Link>
              </div>

              <ApprovalActionForm taskId={task.id} />
            </article>
          ))
        ) : (
          <article className="empty-state">
            <div>
              <p className="eyebrow">Queue state</p>
              <h2>No pending approvals</h2>
              <p className="muted">
                Once policy review routes a case to approval, it will appear here with decision controls.
              </p>
              <p className="muted">
                {errorMessage
                  ? errorMessage
                  : `If you expected a task, confirm the API is running at ${apiBaseUrl} and that policy routed the case to AWAITING_APPROVAL.`}
              </p>
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
