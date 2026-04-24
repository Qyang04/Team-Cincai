import Link from "next/link";
import { OcrDebugForm } from "./ocr/ocr-debug-form";
import { PdfTextDebugForm } from "./pdf/pdf-text-debug-form";

const debugModules = [
  {
    title: "OCR utility",
    status: "Active",
    href: "/debug#ocr-utility",
    copy: "Run Tesseract OCR against uploaded images and inspect the comma-joined result.",
  },
  {
    title: "PDF text extraction",
    status: "Active",
    href: "/debug#pdf-text-extraction",
    copy: "Extract text from uploaded PDFs in the browser and inspect the comma-joined result.",
  },
  {
    title: "Component sandbox",
    status: "Planned",
    href: "/debug",
    copy: "Reserved for isolated UI component states, interaction checks, and visual regression inspection.",
  },
  {
    title: "Request harness",
    status: "Planned",
    href: "/debug",
    copy: "Reserved for API payload and form-debug flows without polluting production workflow screens.",
  },
] as const;

export default function DebugPage() {
  return (
    <div className="workspace workspace-tight fade-up">
      <section className="workspace-header">
        <div>
          <span className="kicker">Debug lane</span>
          <h1>Developer debug workspace</h1>
          <p className="section-copy">
            Use this shared workspace for isolated tooling, diagnostics, and component-level checks without creating
            feature-specific top-level pages.
          </p>
        </div>
      </section>

      <section className="surface">
        <div className="surface-head">
          <div>
            <p className="eyebrow">Workspace registry</p>
            <h2>Available and planned debug modules</h2>
          </div>
          <span className="inline-status">Shared debug entry point</span>
        </div>

        <div className="lane-grid">
          {debugModules.map((module) => (
            <article key={module.title} className="lane-item">
              <div className="surface-head" style={{ marginBottom: 0 }}>
                <div>
                  <p className="eyebrow">Debug module</p>
                  <h3>{module.title}</h3>
                </div>
                <span className="inline-status">{module.status}</span>
              </div>
              <p className="muted">{module.copy}</p>
              <Link href={module.href} className="button-secondary">
                Open module
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section id="ocr-utility" className="ocr-workspace-grid">
        <article className="surface surface-large">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Module: OCR</p>
              <h2>Recognize text from uploaded images</h2>
            </div>
            <span className="inline-status">Tesseract OCR</span>
          </div>
          <OcrDebugForm />
        </article>

        <aside className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Module notes</p>
              <h2>Current debug scope</h2>
            </div>
          </div>
          <div className="timeline-list">
            <div className="timeline-step">
              <strong>Client-side OCR run</strong>
              <p className="muted">Processes uploaded images in the browser with the open-source Tesseract engine.</p>
            </div>
            <div className="timeline-step">
              <strong>Joined output contract</strong>
              <p className="muted">Returns recognized text as a single comma-separated string plus per-image details.</p>
            </div>
            <div className="timeline-step">
              <strong>Future-friendly workspace</strong>
              <p className="muted">Additional debug modules should be added here as separate panels or subroutes.</p>
            </div>
          </div>
        </aside>
      </section>

      <section id="pdf-text-extraction" className="ocr-workspace-grid">
        <article className="surface surface-large">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Module: PDF</p>
              <h2>Extract text from uploaded PDFs</h2>
            </div>
            <span className="inline-status">PDF.js</span>
          </div>
          <PdfTextDebugForm />
        </article>

        <aside className="surface">
          <div className="surface-head">
            <div>
              <p className="eyebrow">Module notes</p>
              <h2>PDF extraction scope</h2>
            </div>
          </div>
          <div className="timeline-list">
            <div className="timeline-step">
              <strong>Client-side PDF text pass</strong>
              <p className="muted">Processes uploaded PDFs in the browser using PDF.js text extraction.</p>
            </div>
            <div className="timeline-step">
              <strong>Joined output contract</strong>
              <p className="muted">Returns extracted text as a single comma-separated string plus per-file details.</p>
            </div>
            <div className="timeline-step">
              <strong>Clear boundary</strong>
              <p className="muted">Scanned PDFs still need OCR after page rendering because embedded text may be absent.</p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
