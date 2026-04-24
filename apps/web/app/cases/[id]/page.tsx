import {
  DEFAULT_API_BASE_URL,
  type CaseApprovalTask,
  caseDetailResponseSchema,
  type CaseDetailResponse,
  type CaseTimelineItem,
} from "@finance-ops/shared";
import Link from "next/link";
import { fetchApiJson } from "../../lib/server-api";
import { ArtifactPreviewDialog } from "./artifact-preview-dialog";
import { ExportActionForm } from "./export-action-form";
import { QuestionResponseForm } from "./question-response-form";
import { RefreshButton } from "./refresh-button";

type CaseDetailPageProps = {
  params: Promise<{ id: string }>;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

const statusMeta: Record<
  string,
  { label: string; description: string; variant: "attention" | "warning" | "critical" | "success" | "neutral" }
> = {
  DRAFT: { label: "Draft", description: "Case exists but has not entered processing.", variant: "neutral" },
  SUBMITTED: { label: "Submitted", description: "Submission received, waiting for the workflow engine.", variant: "neutral" },
  INTAKE_PROCESSING: {
    label: "Intake processing",
    description: "AI is extracting evidence and preparing the case for policy controls.",
    variant: "attention",
  },
  AWAITING_REQUESTER_INFO: {
    label: "Awaiting requester info",
    description: "The requester must answer clarification questions before the case can continue.",
    variant: "warning",
  },
  POLICY_REVIEW: {
    label: "Policy review",
    description: "Controls are being applied to determine routing, blocking issues, or escalation.",
    variant: "attention",
  },
  AWAITING_APPROVAL: {
    label: "Awaiting approval",
    description: "The approval matrix is active. Approver decision pending.",
    variant: "attention",
  },
  AWAITING_APPROVER_INFO_RESPONSE: {
    label: "Awaiting approver info response",
    description: "An approver asked a follow-up. Case is paused until answered.",
    variant: "warning",
  },
  FINANCE_REVIEW: {
    label: "Finance review",
    description: "Finance must resolve policy, reconciliation, or coding concerns.",
    variant: "warning",
  },
  APPROVED: { label: "Approved", description: "All required approvals are complete.", variant: "success" },
  REJECTED: { label: "Rejected", description: "Case was rejected and will not be exported.", variant: "critical" },
  EXPORT_READY: {
    label: "Export ready",
    description: "Case can be exported to accounting. Trigger export when ready.",
    variant: "success",
  },
  EXPORTING: { label: "Exporting", description: "Export connector is in progress.", variant: "attention" },
  EXPORTED: { label: "Exported", description: "Accounting payload was handed off successfully.", variant: "success" },
  RECOVERABLE_EXCEPTION: {
    label: "Recoverable exception",
    description: "A retryable failure occurred. Manual recovery or retry required.",
    variant: "critical",
  },
  CLOSED: { label: "Closed", description: "Terminal state after rejection or successful export.", variant: "neutral" },
};

function statusChipClass(status: string): string {
  const variant = statusMeta[status]?.variant ?? "neutral";
  if (variant === "neutral") {
    return "inline-status";
  }
  return `inline-status inline-status-${variant}`;
}

async function getCaseDetail(
  id: string,
): Promise<{ caseDetail: CaseDetailResponse | null; errorMessage: string | null; isMissing: boolean }> {
  const result = await fetchApiJson<CaseDetailResponse | null>({
    url: `${apiBaseUrl}/cases/${id}`,
    init: {
      cache: "no-store",
    },
    fallbackData: null,
    resourceLabel: `Case ${id}`,
    parse: (value) => caseDetailResponseSchema.parse(value),
  });

  return {
    caseDetail: result.data,
    errorMessage: result.ok ? null : result.message,
    isMissing: !result.ok && result.status === 404,
  };
}

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { id } = await params;
  const { caseDetail, errorMessage, isMissing } = await getCaseDetail(id);

  if (!caseDetail) {
    return (
      <section className="empty-state">
        <div>
          <p className="eyebrow">Case detail</p>
          <h2>{isMissing ? "Case not found" : "Case detail failed to load"}</h2>
          <p className="muted">
            {errorMessage ??
              "The API could not return this case. Start the backend and submit a case from the intake form to populate live detail data."}
          </p>
          <p className="muted">
            Looked for <code>{id}</code> at <code>{apiBaseUrl}</code>.
          </p>
          <Link className="button-primary" href="/cases/new">
            Start a new case
          </Link>
        </div>
      </section>
    );
  }

  const latestExtraction = caseDetail.latestExtraction;
  const latestPolicy = caseDetail.latestPolicyResult;
  const latestExport = caseDetail.latestExportRecord;
  const extractedEntries = latestExtraction ? Object.entries(latestExtraction.fieldsJson) : [];
  const provenance = (latestExtraction?.provenance ?? {}) as Record<string, string>;
  const stage = statusMeta[caseDetail.stage] ?? statusMeta[caseDetail.status];
  const unansweredQuestions = caseDetail.openQuestions.filter((question) => question.status !== "ANSWERED");
  const timeline = buildTimeline(caseDetail);
  const approvalStages = buildApprovalStages(caseDetail.approvalTasks);

  return (
    <div className="workspace workspace-tight fade-up">
      <section className="case-hero">
        <div className="case-hero-top">
          <div>
            <span className="kicker">Case stream</span>
            <h1>{humanizeWorkflow(caseDetail.workflowType)}</h1>
            <p className="section-copy">
              {stage?.description ??
                "Track extracted evidence, clarification, policy outcome, and downstream resolution in one surface."}
            </p>
            <p className="muted">
              Case <code>{caseDetail.id}</code>
            </p>
          </div>
          <div className="header-meta">
            <span className={statusChipClass(caseDetail.status)}>{stage?.label ?? caseDetail.status}</span>
            <span className="inline-status">Priority {caseDetail.priority}</span>
            <span className="inline-status">Requester {caseDetail.requesterId}</span>
            {caseDetail.assignedTo ? (
              <span className="inline-status">Assigned {caseDetail.assignedTo}</span>
            ) : null}
            <RefreshButton />
          </div>
        </div>

        <div className="case-overview">
          <article className="case-card-dark">
            <p className="eyebrow">Copilot posture</p>
            <h2>{stage?.label ?? caseDetail.status}</h2>
            <p className="muted">
              {caseDetail.reasoningSummary ??
                (unansweredQuestions.length
                  ? `The requester has ${unansweredQuestions.length} open question${unansweredQuestions.length === 1 ? "" : "s"} to answer before the case can progress.`
                  : latestPolicy?.requiresFinanceReview
                    ? "Policy indicates finance review is required before the case can continue."
                    : latestPolicy?.blockingIssues.length
                      ? "Policy produced blocking issues that must be resolved."
                      : "The workflow is on a recoverable path with visible extraction, review, and export state.")}
            </p>
            <p className="muted">
              Created {new Date(caseDetail.createdAt).toLocaleString()} - Updated{" "}
              {new Date(caseDetail.updatedAt).toLocaleString()}
            </p>
          </article>

          <div className="case-metric-grid">
            <div className="case-metric-box">
              <p className="detail-label">Extraction confidence</p>
              <strong>{latestExtraction ? `${Math.round(latestExtraction.confidence * 100)}%` : "N/A"}</strong>
            </div>
            <div className="case-metric-box">
              <p className="detail-label">Open questions</p>
              <strong>{unansweredQuestions.length}</strong>
            </div>
            <div className="case-metric-box">
              <p className="detail-label">Approval tasks</p>
              <strong>{caseDetail.approvalTasks.length}</strong>
            </div>
            <div className="case-metric-box">
              <p className="detail-label">Finance reviews</p>
              <strong>{caseDetail.financeReviews.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="case-main-grid">
        <article className="surface surface-large">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Structured fields</p>
              <h2>Extraction result</h2>
            </div>
            {latestExtraction ? (
              <span className="inline-status">
                Confidence {Math.round(latestExtraction.confidence * 100)}%
              </span>
            ) : null}
          </div>
          {latestExtraction ? (
            <div className="data-list">
              {extractedEntries.map(([key, value]) => {
                const hasValue = value !== null && value !== undefined && value !== "";
                const source = provenance[key];
                return (
                  <div key={key} className="data-row">
                    <div>
                      <strong>{humanizeKey(key)}</strong>
                      {source ? (
                        <p className="muted" style={{ margin: 0 }}>
                          Source: {source}
                        </p>
                      ) : null}
                    </div>
                    <span className={hasValue ? "" : "text-danger"}>{hasValue ? String(value) : "Missing"}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">No extraction persisted yet.</p>
          )}
        </article>

        <article className="analysis-panel">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Clarification</p>
              <h2>Open questions</h2>
            </div>
            {unansweredQuestions.length ? (
              <span className="inline-status inline-status-warning">{unansweredQuestions.length} open</span>
            ) : (
              <span className="inline-status inline-status-success">All answered</span>
            )}
          </div>
          {caseDetail.openQuestions.length ? (
            <div className="action-stack">
              {caseDetail.openQuestions.map((question) => (
                <div key={question.id} className="question-block">
                  <strong>{question.question}</strong>
                  {question.source ? <p className="muted">Asked by: {question.source}</p> : null}
                  {question.answer ? (
                    <p className="muted">Answer: {question.answer}</p>
                  ) : (
                    <>
                      <div className="detail-label">Status: {question.status}</div>
                      <QuestionResponseForm caseId={caseDetail.id} questionId={question.id} />
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No clarification questions for this case.</p>
          )}
        </article>
      </section>

      <section className="case-main-grid">
        <article className="surface surface-large">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Evidence</p>
              <h2>Artifacts</h2>
            </div>
            <span className="inline-status">{caseDetail.artifacts.length} attached</span>
          </div>
          {caseDetail.artifacts.length ? (
            <div className="action-stack">
              {caseDetail.artifacts.map((artifact) => (
                <div key={artifact.id} className="artifact-block">
                  <div className="split-line">
                    <ArtifactPreviewDialog caseId={caseDetail.id} artifact={artifact} />
                    <span className="inline-status">{artifact.processingStatus}</span>
                  </div>
                  {artifact.uploadedAt ? (
                    <div className="muted">Uploaded: {new Date(artifact.uploadedAt).toLocaleString()}</div>
                  ) : null}
                  {artifact.processingCompletedAt ? (
                    <div className="muted">
                      Processed: {new Date(artifact.processingCompletedAt).toLocaleString()}
                    </div>
                  ) : null}
                  {artifact.extractedText ? <div className="muted">Extracted: {artifact.extractedText}</div> : null}
                  {artifact.errorMessage ? <div className="text-danger">Error: {artifact.errorMessage}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No artifacts attached yet.</p>
          )}
        </article>

        <article className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Workflow history</p>
              <h2>Timeline</h2>
            </div>
            <span className="inline-status">{timeline.length} events</span>
          </div>
          {timeline.length ? (
            <div className="timeline-list">
              {timeline.map((entry) => (
                <div className="timeline-step" key={entry.id}>
                  <strong>{entry.title}</strong>
                  <p className="muted">{entry.subtitle}</p>
                  <p className="muted">{new Date(entry.at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No workflow events yet.</p>
          )}
        </article>
      </section>

      <section className="case-main-grid">
        <article className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Policy evaluation</p>
              <h2>Decision controls</h2>
            </div>
            {latestPolicy ? (
              <span
                className={`inline-status ${latestPolicy.passed ? "inline-status-success" : "inline-status-critical"}`}
              >
                {latestPolicy.passed ? "Passed" : "Not passed"}
              </span>
            ) : null}
          </div>
          {latestPolicy ? (
            <>
              <div className="detail-grid">
                <div>
                  <p className="detail-label">Requires finance review</p>
                  <p>{latestPolicy.requiresFinanceReview ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="detail-label">Warnings</p>
                  <p>{latestPolicy.warnings.length}</p>
                </div>
                <div>
                  <p className="detail-label">Blocking issues</p>
                  <p>{latestPolicy.blockingIssues.length}</p>
                </div>
                <div>
                  <p className="detail-label">Duplicate signals</p>
                  <p>{latestPolicy.duplicateSignals.length}</p>
                </div>
              </div>
              {latestPolicy.warnings.length ? (
                <>
                  <p className="detail-label" style={{ marginTop: 16 }}>
                    Warnings
                  </p>
                  <ul className="muted clean-list">
                    {latestPolicy.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {latestPolicy.blockingIssues.length ? (
                <>
                  <p className="detail-label" style={{ marginTop: 16 }}>
                    Blocking issues
                  </p>
                  <ul className="muted clean-list">
                    {latestPolicy.blockingIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {latestPolicy.duplicateSignals.length ? (
                <>
                  <p className="detail-label" style={{ marginTop: 16 }}>
                    Duplicate and fraud signals
                  </p>
                  <ul className="muted clean-list">
                    {latestPolicy.duplicateSignals.map((signal) => (
                      <li key={signal}>{signal}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : (
            <p className="muted">Policy evaluation has not run yet.</p>
          )}
        </article>

        <article className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Downstream workflow</p>
              <h2>Resolution</h2>
            </div>
          </div>

          {approvalStages.length ? (
            <>
              <p className="detail-label">Approval matrix timeline</p>
              <div className="approval-stage-list">
                {approvalStages.map((stage) => (
                  <article key={stage.stageNumber} id={`approval-stage-${stage.stageNumber}`} className="approval-stage-card">
                    <div className="split-line">
                      <strong>
                        Stage {stage.stageNumber}: {stage.label}
                      </strong>
                      <span className={statusChipClass(stage.summaryStatus)}>{humanizeKey(stage.summaryStatus)}</span>
                    </div>
                    <p className="muted">
                      Mode: {stage.mode.toLowerCase()} | Rule: {stage.dependencyType.toLowerCase()} (
                      {stage.requiredApprovals}/{stage.totalCount}) | Completed {stage.approvedCount}/{stage.totalCount}
                    </p>
                    {stage.slaHours !== null || stage.stageDueAt ? (
                      <p className="muted">
                        SLA: {stage.slaHours !== null ? `${stage.slaHours}h` : "Not set"}
                        {stage.stageDueAt ? ` | Stage due ${new Date(stage.stageDueAt).toLocaleString()}` : ""}
                        {stage.escalatesTo ? ` | Escalates to ${stage.escalatesTo}` : ""}
                      </p>
                    ) : null}
                    {stage.blocker ? (
                      <p className="text-danger">
                        Blocked by: {stage.blocker}{" "}
                        {stage.blockerStageNumber ? <a href={`#approval-stage-${stage.blockerStageNumber}`}>Jump</a> : null}
                      </p>
                    ) : null}
                    <div className="approval-stage-members">
                      {stage.tasks.map((task) => (
                        <div key={task.id} className="approval-stage-member">
                          <span>{task.approverId}</span>
                          <span className={statusChipClass(task.status)}>{humanizeKey(task.status)}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {caseDetail.approvalTasks.length ? (
            <>
              <p className="detail-label">Approval tasks</p>
              <div className="action-stack">
                {caseDetail.approvalTasks.map((task) => (
                  <div key={task.id} className="question-block">
                    <div className="split-line">
                      <strong>{task.approverId}</strong>
                      <span className="inline-status">{task.status}</span>
                    </div>
                    {task.decision ? <p className="muted">Decision: {task.decision}</p> : null}
                    {task.decisionReason ? <p className="muted">Reason: {task.decisionReason}</p> : null}
                    {task.dueAt ? <p className="muted">Due {new Date(task.dueAt).toLocaleString()}</p> : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {caseDetail.financeReviews.length ? (
            <>
              <p className="detail-label" style={{ marginTop: 16 }}>
                Finance reviews
              </p>
              <div className="action-stack">
                {caseDetail.financeReviews.map((review) => (
                  <div key={review.id} className="question-block">
                    <div className="split-line">
                      <strong>{review.reviewerId ?? "Unassigned"}</strong>
                      <span className="inline-status">{review.outcome ?? "PENDING"}</span>
                    </div>
                    {review.note ? <p className="muted">{review.note}</p> : null}
                    <p className="muted">Opened {new Date(review.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <p className="detail-label" style={{ marginTop: 16 }}>
            Export
          </p>
          {latestExport ? (
            <div className="detail-grid">
              <div>
                <p className="detail-label">Status</p>
                <p>{latestExport.status}</p>
              </div>
              <div>
                <p className="detail-label">Connector</p>
                <p>{latestExport.connectorName ?? "mock-accounting-export"}</p>
              </div>
              <div>
                <p className="detail-label">Created</p>
                <p>{new Date(latestExport.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="detail-label">Error</p>
                <p className={latestExport.errorMessage ? "text-danger" : ""}>
                  {latestExport.errorMessage ?? "None"}
                </p>
              </div>
            </div>
          ) : (
            <p className="muted">{caseDetail.exportReadinessSummary.summary}</p>
          )}
          {caseDetail.failureMode ? <p className="text-danger">Failure mode: {caseDetail.failureMode}</p> : null}
          {caseDetail.status === "EXPORT_READY" ? <ExportActionForm caseId={caseDetail.id} /> : null}
        </article>
      </section>
    </div>
  );
}

function buildTimeline(caseDetail: CaseDetailResponse): CaseTimelineItem[] {
  const transitionEntries: CaseTimelineItem[] = caseDetail.workflowTransitions.map((transition) => ({
    id: `transition-${transition.id}`,
    title: `${statusMeta[transition.fromStatus]?.label ?? transition.fromStatus} -> ${
      statusMeta[transition.toStatus]?.label ?? transition.toStatus
    }`,
    subtitle: transition.note
      ? `${transition.actorType.toLowerCase()}: ${transition.note}`
      : `by ${transition.actorType.toLowerCase()}${transition.actorId ? ` (${transition.actorId})` : ""}`,
    at: transition.createdAt,
    kind: "transition",
  }));

  const auditEntries: CaseTimelineItem[] = caseDetail.auditEvents.map((event) => ({
    id: `audit-${event.id}`,
    title: humanizeKey(event.eventType),
    subtitle: `Recorded by ${event.actorType.toLowerCase()}`,
    at: event.createdAt,
    kind: "audit",
  }));

  return [...transitionEntries, ...auditEntries].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}

type ApprovalStageView = {
  stageNumber: number;
  mode: string;
  label: string;
  dependencyType: string;
  requiredApprovals: number;
  slaHours: number | null;
  stageDueAt: string | null;
  escalatesTo: string | null;
  tasks: CaseApprovalTask[];
  approvedCount: number;
  totalCount: number;
  summaryStatus: string;
  blocker: string | null;
  blockerStageNumber: number | null;
};

function buildApprovalStages(tasks: CaseApprovalTask[]): ApprovalStageView[] {
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
  const stages: ApprovalStageView[] = stageNumbers.map((stageNumber) => {
    const stageTasks = grouped.get(stageNumber) ?? [];
    const approvedCount = stageTasks.filter((task) => task.status === "APPROVED").length;
    const rejectedCount = stageTasks.filter((task) => task.status === "REJECTED").length;
    const blockedCount = stageTasks.filter((task) => task.status === "BLOCKED").length;
    const inFlightCount = stageTasks.filter(
      (task) => task.status === "PENDING" || task.status === "INFO_REQUESTED",
    ).length;
    const totalCount = stageTasks.length;

    let summaryStatus = "PENDING";
    if (rejectedCount > 0) {
      summaryStatus = "REJECTED";
    } else if (approvedCount === totalCount && totalCount > 0) {
      summaryStatus = "APPROVED";
    } else if (blockedCount === totalCount && totalCount > 0) {
      summaryStatus = "BLOCKED";
    } else if (inFlightCount > 0 || approvedCount > 0) {
      summaryStatus = "ACTIVE";
    }

    return {
      stageNumber,
      mode: stageTasks[0]?.stageMode ?? "SEQUENTIAL",
      label: stageTasks[0]?.stageLabel ?? "Approval stage",
      dependencyType: stageTasks[0]?.stageDependencyType ?? "ALL_REQUIRED",
      requiredApprovals: stageTasks[0]?.stageRequiredApprovals ?? totalCount,
      slaHours: stageTasks[0]?.stageSlaHours ?? null,
      stageDueAt: stageTasks[0]?.stageDueAt ?? null,
      escalatesTo: stageTasks[0]?.stageEscalatesTo ?? null,
      tasks: stageTasks,
      approvedCount,
      totalCount,
      summaryStatus,
      blocker: null,
      blockerStageNumber: null,
    };
  });

  return stages.map((stage, index) => {
    if (stage.summaryStatus !== "BLOCKED") {
      return stage;
    }
    const blockingStage = stages[index - 1];
    if (!blockingStage) {
      return stage;
    }
    return {
      ...stage,
      blocker: `Stage ${blockingStage.stageNumber} (${blockingStage.label}) not completed`,
      blockerStageNumber: blockingStage.stageNumber,
    };
  });
}

function humanizeKey(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

function humanizeWorkflow(workflowType: string): string {
  switch (workflowType) {
    case "EXPENSE_CLAIM":
      return "Expense claim";
    case "PETTY_CASH_REIMBURSEMENT":
      return "Petty cash reimbursement";
    case "VENDOR_INVOICE_APPROVAL":
      return "Vendor invoice approval";
    case "INTERNAL_PAYMENT_REQUEST":
      return "Internal payment request";
    default:
      return humanizeKey(workflowType);
  }
}
