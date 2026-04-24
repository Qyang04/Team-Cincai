import Link from "next/link";
import { OcrDebugForm } from "./ocr-debug-form";

export default function OcrDebugPage() {
  return (
    <div className="workspace workspace-tight fade-up">
      <section className="workspace-header">
        <div>
          <span className="kicker">Debug lane</span>
          <h1>OCR debug module</h1>
          <p className="section-copy">
            OCR now lives under the shared debug workspace. Use this route when you want the OCR tool on its own, or
            return to the general debug page to access other debug modules.
          </p>
        </div>
        <Link href="/debug" className="button-secondary">
          Back to debug workspace
        </Link>
      </section>

      <section className="ocr-workspace-grid">
        <article className="surface surface-large">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Focused module</p>
              <h2>OCR tool</h2>
            </div>
            <span className="inline-status">Dedicated subroute</span>
          </div>
          <OcrDebugForm />
        </article>

        <aside className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Route role</p>
              <h2>Dedicated OCR view</h2>
            </div>
          </div>
          <div className="timeline-list">
            <div className="timeline-step">
              <strong>Shared workspace first</strong>
              <p className="muted">The main debug entry remains <code>/debug</code>.</p>
            </div>
            <div className="timeline-step">
              <strong>Focused route when needed</strong>
              <p className="muted">Keep subroutes like this for tools that benefit from a standalone screen.</p>
            </div>
            <div className="timeline-step">
              <strong>Reusable pattern</strong>
              <p className="muted">Future debug components should follow the same workspace-plus-module structure.</p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
