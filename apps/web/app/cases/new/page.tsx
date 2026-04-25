import { CaseForm } from "./case-form";

const workflowNotes = [
  { title: "Expense claim", copy: "Receipts, reimbursements, and travel-style requests." },
  { title: "Petty cash reimbursement", copy: "Low-value requests with lightweight supporting evidence." },
  { title: "Vendor invoice approval", copy: "Invoice extraction, routing, and finance escalation logic." },
  { title: "Internal payment request", copy: "Higher-control internal payouts with structured checks." },
] as const;

export default function NewCasePage() {
  return (
    <div className="workspace workspace-tight fade-up">
      <section className="workspace-header">
        <div>
          <span className="kicker">New case intake</span>
          <h1>Initiate financial review</h1>
          <p className="section-copy">
            Create a draft, attach the evidence you have, and let the workflow engine decide what is missing next.
          </p>
        </div>
      </section>

      <section className="intake-grid">
        <article className="surface surface-large">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Intake form</p>
              <h2>Submit request</h2>
            </div>
            <span className="inline-status">Live data enabled</span>
          </div>
          <CaseForm />
        </article>

        <aside className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Workflow lanes</p>
              <h2>Supported request types</h2>
            </div>
          </div>
          <div className="timeline-list">
            {workflowNotes.map((workflow) => (
              <div key={workflow.title} className="timeline-step">
                <strong>{workflow.title}</strong>
                <p className="muted">{workflow.copy}</p>
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 16 }}>
            After submission, the AI intake harness extracts structured fields, raises clarification questions when
            evidence is thin, and the policy engine routes the case to approval or finance review.
          </p>
        </aside>
      </section>
    </div>
  );
}
