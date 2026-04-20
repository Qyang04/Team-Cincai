import { QuestionResponseForm } from "./question-response-form";
import { ExportActionForm } from "./export-action-form";

type CaseDetailPageProps = {
  params: Promise<{ id: string }>;
};

type CaseDetailResponse = {
  id: string;
  workflowType: string;
  status: string;
  priority: string;
  requesterId: string;
  artifacts: Array<{
    id: string;
    filename: string;
    processingStatus: string;
    storageUri?: string | null;
    errorMessage?: string | null;
    extractedText?: string | null;
    uploadedAt?: string | null;
    processingStartedAt?: string | null;
    processingCompletedAt?: string | null;
  }>;
  extractionResults: Array<{
    id: string;
    fieldsJson: Record<string, string | number | null>;
    confidence: number;
  }>;
  openQuestions: Array<{
    id: string;
    question: string;
    answer?: string | null;
    status: string;
  }>;
  policyResults: Array<{
    id: string;
    passed: boolean;
    warnings: string[];
    blockingIssues: string[];
    requiresFinanceReview: boolean;
    duplicateSignals: string[];
  }>;
  approvalTasks: Array<{
    id: string;
    status: string;
    approverId: string;
    decision?: string | null;
  }>;
  financeReviews: Array<{
    id: string;
    outcome?: string | null;
    note?: string | null;
    reviewerId?: string | null;
  }>;
  exportRecords: Array<{
    id: string;
    status: string;
    errorMessage?: string | null;
  }>;
  auditEvents: Array<{
    id: string;
    eventType: string;
    actorType: string;
    createdAt: string;
  }>;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

async function getCaseDetail(id: string): Promise<CaseDetailResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl}/cases/${id}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { id } = await params;
  const caseDetail = await getCaseDetail(id);

  if (!caseDetail) {
    return (
      <section className="empty-state">
        <div>
          <p className="eyebrow">Case detail</p>
          <h2>Case not available</h2>
          <p className="muted">
            The API could not return this case yet. Start the backend and submit a case from the intake form to populate
            live detail data.
          </p>
        </div>
      </section>
    );
  }

  const latestExtraction = caseDetail.extractionResults[0];
  const latestPolicy = caseDetail.policyResults[0];
  const latestExport = caseDetail.exportRecords[0];
  const extractedEntries = latestExtraction ? Object.entries(latestExtraction.fieldsJson) : [];

  return (
    <div className="workspace workspace-tight fade-up">
      <section className="case-hero">
        <div className="case-hero-top">
          <div>
            <span className="kicker">Case stream</span>
            <h1>{caseDetail.id}</h1>
            <p className="section-copy">
              Track extracted evidence, clarification, policy outcome, and downstream resolution in one command surface.
            </p>
          </div>
          <div className="header-meta">
            <span className="inline-status">{caseDetail.workflowType}</span>
            <span className="inline-status">{caseDetail.status}</span>
            <span className="inline-status">Priority {caseDetail.priority}</span>
            <span className="inline-status">Requester {caseDetail.requesterId}</span>
          </div>
        </div>

        <div className="case-overview">
          <article className="case-card-dark">
            <p className="eyebrow">Copilot analysis</p>
            <h2>Current case posture</h2>
            <p className="muted">
              {latestPolicy?.requiresFinanceReview
                ? "Policy checks indicate manual finance intervention is required before the case can continue."
                : "The workflow remains in a recoverable path with visible extraction, review, and export state."}
            </p>
          </article>

          <div className="case-metric-grid">
            <div className="case-metric-box">
              <p className="detail-label">Extraction confidence</p>
              <strong>{latestExtraction ? `${(latestExtraction.confidence * 100).toFixed(0)}%` : "N/A"}</strong>
            </div>
            <div className="case-metric-box">
              <p className="detail-label">Open questions</p>
              <strong>{caseDetail.openQuestions.length}</strong>
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
              <span className="inline-status">Confidence {(latestExtraction.confidence * 100).toFixed(0)}%</span>
            ) : null}
          </div>
          {latestExtraction ? (
            <div className="data-list">
              {extractedEntries.map(([key, value]) => (
                <div key={key} className="data-row">
                  <strong>{key}</strong>
                  <span>{value ? String(value) : "Missing"}</span>
                </div>
              ))}
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
          </div>
          {caseDetail.openQuestions.length ? (
            <div className="action-stack">
              {caseDetail.openQuestions.map((question) => (
                <div key={question.id} className="question-block">
                  <strong>{question.question}</strong>
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
          </div>
          {caseDetail.artifacts.length ? (
            <div className="action-stack">
              {caseDetail.artifacts.map((artifact) => (
                <div key={artifact.id} className="artifact-block">
                  <div className="split-line">
                    <strong>{artifact.filename}</strong>
                    <span className="inline-status">{artifact.processingStatus}</span>
                  </div>
                  {artifact.uploadedAt ? <div className="muted">Uploaded: {new Date(artifact.uploadedAt).toLocaleString()}</div> : null}
                  {artifact.processingCompletedAt ? (
                    <div className="muted">Processed: {new Date(artifact.processingCompletedAt).toLocaleString()}</div>
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
              <p className="eyebrow">Audit timeline</p>
              <h2>History</h2>
            </div>
          </div>
          <div className="timeline-list">
            {caseDetail.auditEvents.map((event) => (
              <div className="timeline-step" key={event.id}>
                <strong>{event.eventType}</strong>
                <p className="muted">
                  {event.eventType} by {event.actorType} at {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="case-main-grid">
        <article className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Policy evaluation</p>
              <h2>Decision controls</h2>
            </div>
          </div>
          {latestPolicy ? (
            <>
              <div className="detail-grid">
                <div>
                  <p className="detail-label">Passed</p>
                  <p>{latestPolicy.passed ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="detail-label">Requires finance review</p>
                  <p>{latestPolicy.requiresFinanceReview ? "Yes" : "No"}</p>
                </div>
              </div>
              {latestPolicy.warnings.length ? (
                <>
                  <strong>Warnings</strong>
                  <ul className="muted clean-list">
                    {latestPolicy.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {latestPolicy.blockingIssues.length ? (
                <>
                  <strong>Blocking issues</strong>
                  <ul className="muted clean-list">
                    {latestPolicy.blockingIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
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
          <div className="detail-grid">
            <div>
              <p className="detail-label">Approval tasks</p>
              <p>{caseDetail.approvalTasks.length}</p>
            </div>
            <div>
              <p className="detail-label">Finance reviews</p>
              <p>{caseDetail.financeReviews.length}</p>
            </div>
            <div>
              <p className="detail-label">Latest export</p>
              <p>{latestExport?.status ?? "Not created yet"}</p>
            </div>
            <div>
              <p className="detail-label">Duplicate signals</p>
              <p>{latestPolicy?.duplicateSignals.length ?? 0}</p>
            </div>
          </div>
          {latestExport?.errorMessage ? <p className="text-danger">Export error: {latestExport.errorMessage}</p> : null}
          {caseDetail.status === "EXPORT_READY" ? <ExportActionForm caseId={caseDetail.id} /> : null}
        </article>
      </section>
    </div>
  );
}
