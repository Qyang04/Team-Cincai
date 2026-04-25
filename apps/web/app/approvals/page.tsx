import {
  DEFAULT_API_BASE_URL,
  approvalAnalyticsSummarySchema,
  approvalQueueResponseSchema,
  caseDetailResponseSchema,
  type ApprovalAnalyticsSummary,
  type ApprovalQueueItem,
  type CaseApprovalTask,
} from "@finance-ops/shared";
import Link from "next/link";
import { getServerAuthHeaders } from "../lib/session";
import { fetchApiJson } from "../lib/server-api";
import { ApprovalActionForm } from "./approval-action-form";
import { ApprovalsToastHost } from "./approvals-toast";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

async function getApprovalTasks(): Promise<{ tasks: ApprovalQueueItem[]; errorMessage: string | null }> {
  const headers = await getServerAuthHeaders();
  const result = await fetchApiJson<ApprovalQueueItem[]>({
    url: `${apiBaseUrl}/cases/approvals/tasks`,
    init: {
      cache: "no-store",
      headers,
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

async function getApprovalAnalytics(): Promise<ApprovalAnalyticsSummary | null> {
  const headers = await getServerAuthHeaders();
  const result = await fetchApiJson<ApprovalAnalyticsSummary | null>({
    url: `${apiBaseUrl}/cases/approvals/analytics`,
    init: {
      cache: "no-store",
      headers,
    },
    fallbackData: null,
    resourceLabel: "Approval analytics",
    parse: (value) => approvalAnalyticsSummarySchema.parse(value),
  });
  return result.ok ? result.data : null;
}

type CaseGraph = {
  caseId: string;
  stages: Array<{
    stageNumber: number;
    label: string;
    status: string;
    dependencyType: string;
    requiredApprovals: number;
    total: number;
    approved: number;
    blocker: string | null;
    blockerStageNumber: number | null;
    blockerDetails: string[];
  }>;
};

function resolveStageStatus(input: {
  dependencyType: string;
  requiredApprovals: number;
  total: number;
  approved: number;
  rejected: number;
  inProgress: number;
  blocked: number;
}): string {
  const dependencyType = input.dependencyType;

  if (input.total > 0 && input.blocked === input.total) {
    return "BLOCKED";
  }

  if (dependencyType === "ANY_ONE") {
    if (input.approved >= 1) {
      return "APPROVED";
    }
    if (input.inProgress === 0) {
      return "REJECTED";
    }
    return "ACTIVE";
  }

  if (dependencyType === "MIN_N") {
    const threshold = Math.max(1, Math.min(input.requiredApprovals, input.total));
    if (input.approved >= threshold) {
      return "APPROVED";
    }
    if (input.approved + input.inProgress < threshold) {
      return "REJECTED";
    }
    return "ACTIVE";
  }

  if (input.rejected > 0) {
    return "REJECTED";
  }
  if (input.total > 0 && input.approved === input.total) {
    return "APPROVED";
  }
  return "ACTIVE";
}

function buildCaseGraph(caseId: string, tasks: CaseApprovalTask[]): CaseGraph {
  const grouped = new Map<number, CaseApprovalTask[]>();
  for (const task of tasks) {
    const stageNumber = task.stageNumber ?? 1;
    const existing = grouped.get(stageNumber);
    if (existing) {
      existing.push(task);
    } else {
      grouped.set(stageNumber, [task]);
    }
  }
  const stageNumbers = [...grouped.keys()].sort((a, b) => a - b);
  const stages = stageNumbers.map((stageNumber) => {
    const stageTasks = grouped.get(stageNumber) ?? [];
    const approved = stageTasks.filter((task) => task.status === "APPROVED").length;
    const rejected = stageTasks.filter((task) => task.status === "REJECTED").length;
    const blocked = stageTasks.filter((task) => task.status === "BLOCKED").length;
    const inProgress = stageTasks.filter((task) => task.status === "PENDING" || task.status === "INFO_REQUESTED").length;
    const total = stageTasks.length;
    const dependencyType = stageTasks[0]?.stageDependencyType ?? "ALL_REQUIRED";
    const requiredApprovals = stageTasks[0]?.stageRequiredApprovals ?? total;
    const status = resolveStageStatus({
      dependencyType,
      requiredApprovals,
      total,
      approved,
      rejected,
      inProgress,
      blocked,
    });
    return {
      stageNumber,
      label: stageTasks[0]?.stageLabel ?? "Approval stage",
      status,
      dependencyType,
      requiredApprovals,
      total,
      approved,
      blocker: null as string | null,
      blockerStageNumber: null as number | null,
      blockerDetails: [] as string[],
    };
  });

  return {
    caseId,
    stages: stages.map((stage, index) => {
      if (stage.status !== "BLOCKED" || index <= 0) {
        return stage;
      }
      const previousStageNumber = stages[index - 1].stageNumber;
      const previousStageTasks = grouped.get(previousStageNumber) ?? [];
      const blockerDetails = previousStageTasks
        .filter((task) => task.status !== "APPROVED")
        .map((task) => `${task.approverId} (${task.status})${task.decisionReason ? `: ${task.decisionReason}` : ""}`);
      return {
        ...stage,
        blocker: `Depends on stage ${stages[index - 1].stageNumber}`,
        blockerStageNumber: stages[index - 1].stageNumber,
        blockerDetails,
      };
    }),
  };
}

async function getCaseGraphs(caseIds: string[]): Promise<Record<string, CaseGraph>> {
  if (!caseIds.length) {
    return {};
  }
  const headers = await getServerAuthHeaders();
  const entries = await Promise.all(
    caseIds.map(async (caseId) => {
      const result = await fetchApiJson({
        url: `${apiBaseUrl}/cases/${caseId}`,
        init: {
          cache: "no-store",
          headers,
        },
        fallbackData: null,
        resourceLabel: `Case graph ${caseId}`,
        parse: (value) => caseDetailResponseSchema.parse(value),
      });
      if (!result.ok || !result.data) {
        return [caseId, null] as const;
      }
      return [caseId, buildCaseGraph(caseId, result.data.approvalTasks)] as const;
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is [string, CaseGraph] => entry[1] !== null));
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

function getDelegationBadge(
  task: ApprovalQueueItem,
): { label: string; className: "inline-status-delegated-auto" | "inline-status-delegated-manual" } | null {
  if (!task.delegatedFrom) {
    return null;
  }
  if ((task.decisionReason ?? "").toLowerCase().includes("auto-delegated")) {
    return { label: "Auto-delegated (OOO)", className: "inline-status-delegated-auto" };
  }
  return { label: "Delegated manually", className: "inline-status-delegated-manual" };
}

function getStageStatusClass(status: string): string {
  if (status === "APPROVED") return "inline-status-success";
  if (status === "REJECTED") return "inline-status-critical";
  if (status === "BLOCKED") return "inline-status-warning";
  return "inline-status-attention";
}

export default async function ApprovalsPage() {
  const { tasks, errorMessage } = await getApprovalTasks();
  const analytics = await getApprovalAnalytics();
  const caseIds = [...new Set(tasks.map((task) => task.case.id))];
  const caseGraphs = await getCaseGraphs(caseIds);

  return (
    <div className="workspace workspace-tight fade-up">
      <ApprovalsToastHost />
      {errorMessage ? (
        <div className="notice">
          <strong>Approval queue failed to load.</strong>
          <p className="muted">{errorMessage}</p>
        </div>
      ) : null}

      <section className="workspace-header">
        <div>
          <span className="kicker">Approval lane</span>
          <h1>Pending approvals</h1>
          <p className="section-copy">
            Review cases routed by policy. Each decision is captured in the audit trail with rationale. Open a case to
            preview attachments: click a filename in the Artifacts block to view images, PDFs, and text in a dialog (PDFs
            scroll between pages in the built-in viewer).
          </p>
        </div>
        <div className="split-actions">
          <span className="inline-status">
            {tasks.length} pending task{tasks.length === 1 ? "" : "s"}
          </span>
          {analytics ? (
            <>
              <span className="inline-status">Throughput {analytics.approvedLast7d} approved / {analytics.rejectedLast7d} rejected (7d)</span>
              <span className="inline-status">Delegated open {analytics.delegatedOpenTasks}</span>
              <span className="inline-status">Overdue stages {analytics.overdueActiveStages}</span>
              <span className="inline-status">Escalated stages {analytics.escalatedStages}</span>
              <span className="inline-status">Blocked tasks {analytics.blockedTasks}</span>
              <span className="inline-status">
                Bottleneck {analytics.bottleneckStage ? `S${analytics.bottleneckStage.stageNumber} (${analytics.bottleneckStage.pendingCount})` : "None"}
              </span>
              <span className="inline-status">
                Avg approval {analytics.avgApprovalHours !== null ? `${analytics.avgApprovalHours.toFixed(1)}h` : "N/A"}
              </span>
            </>
          ) : null}
        </div>
      </section>

      {analytics ? (
        <section className="metric-strip">
          <article className="metric-tile">
            <p className="metric-label">7d throughput</p>
            <h2>{analytics.approvedLast7d + analytics.rejectedLast7d}</h2>
            <p className="muted">
              {analytics.approvedLast7d} approved / {analytics.rejectedLast7d} rejected
            </p>
          </article>
          <article className="metric-tile">
            <p className="metric-label">Delegation impact</p>
            <h2>{analytics.delegatedOpenTasks}</h2>
            <p className="muted">Open tasks currently delegated</p>
          </article>
          <article className="metric-tile metric-attention">
            <p className="metric-label">Escalation impact</p>
            <h2>{analytics.escalatedStages}</h2>
            <p className="muted">Stages escalated due to SLA</p>
          </article>
          <article className="metric-tile metric-critical">
            <p className="metric-label">Current bottleneck</p>
            <h2>{analytics.bottleneckStage ? `S${analytics.bottleneckStage.stageNumber}` : "None"}</h2>
            <p className="muted">
              {analytics.bottleneckStage ? `${analytics.bottleneckStage.pendingCount} pending` : "No blocked concentration"}
            </p>
          </article>
        </section>
      ) : null}

      <section className="queue-grid" style={{ gridTemplateColumns: "1fr" }}>
        {tasks.length ? (
          tasks.map((task, index) => {
            const delegationBadge = getDelegationBadge(task);
            return (
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
                  {delegationBadge ? (
                    <span className={`inline-status ${delegationBadge.className}`}>{delegationBadge.label}</span>
                  ) : null}
                  <span className="inline-status">Priority {task.case.priority}</span>
                  <span className="inline-status">Case status {task.case.status}</span>
                </div>
              </div>

              <div className="detail-grid">
                <div>
                  <p className="detail-label">Assigned approver</p>
                  <p>{task.approverId}</p>
                  {task.delegatedFrom ? (
                    <p className="muted" style={{ marginTop: 4 }}>
                      Delegated from {task.delegatedFrom}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="detail-label">Approval stage</p>
                  <p>
                    Stage {task.stageNumber ?? 1}
                    {task.stageMode ? ` (${task.stageMode.toLowerCase()})` : ""}
                  </p>
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

              {task.stageLabel ? (
                <p className="muted" style={{ marginTop: 8 }}>
                  Stage purpose: {task.stageLabel}
                </p>
              ) : null}
              {caseGraphs[task.case.id] ? (
                <div className="approval-stage-list approval-stage-list-compact" style={{ marginTop: 8 }}>
                  <div className="approval-graph-edge-row" aria-hidden="true">
                    {caseGraphs[task.case.id].stages.map((stage, index) => (
                      <span key={`${task.case.id}-edge-${stage.stageNumber}`} className="approval-graph-edge-item">
                        S{stage.stageNumber}
                        {index < caseGraphs[task.case.id].stages.length - 1 ? " -> " : ""}
                      </span>
                    ))}
                  </div>
                  {caseGraphs[task.case.id].stages.map((stage) => (
                    <div key={`${task.case.id}-${stage.stageNumber}`} className="approval-stage-card approval-stage-card-graph">
                      <div className="split-line">
                        <strong>
                          S{stage.stageNumber}: {stage.label}
                        </strong>
                        <span className={`inline-status ${getStageStatusClass(stage.status)}`}>{stage.status}</span>
                      </div>
                      <div className="approval-stage-progress-track" aria-hidden="true">
                        <span
                          className="approval-stage-progress-fill"
                          style={{
                            width: `${stage.total > 0 ? (stage.approved / stage.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <p className="muted approval-stage-rule-line">
                        Rule {stage.dependencyType} ({stage.requiredApprovals}/{stage.total}) | Done {stage.approved}/{stage.total}
                      </p>
                      {stage.blocker ? (
                        <div className="stack-list">
                          <p className="text-danger" style={{ margin: 0 }}>
                            {stage.blocker}{" "}
                            {stage.blockerStageNumber ? (
                              <Link href={`/cases/${task.case.id}#approval-stage-${stage.blockerStageNumber}`}>
                                Drill down blocker
                              </Link>
                            ) : null}
                          </p>
                          {stage.blockerDetails.length ? (
                            <p className="muted" style={{ margin: 0 }}>
                              Blocking tasks: {stage.blockerDetails.join(" | ")}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {stage.blocker ? (
                        <p className="muted" style={{ margin: 0 }}>
                          {stage.blockerStageNumber ? (
                            <Link href={`/cases/${task.case.id}#approval-stage-${stage.blockerStageNumber}`}>Open dependency stage</Link>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="split-actions" style={{ marginTop: 8 }}>
                <Link className="button-secondary" href={`/cases/${task.case.id}`}>
                  Open case detail
                </Link>
              </div>

              <ApprovalActionForm taskId={task.id} />
              </article>
            );
          })
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
                  : "If you expected a task, it may still be processing. Please refresh shortly."}
              </p>
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
