import { PolicyAdminForm } from "./policy-admin-form";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";
const adminHeaders = {
  "x-mock-role": "ADMIN",
  "x-mock-user-id": "admin.user",
};

async function getAdminData() {
  const [policyResponse, routingResponse, connectorsResponse] = await Promise.all([
    fetch(`${apiBaseUrl}/admin/policies`, { cache: "no-store", headers: adminHeaders }),
    fetch(`${apiBaseUrl}/admin/routing`, { cache: "no-store", headers: adminHeaders }),
    fetch(`${apiBaseUrl}/admin/connectors`, { cache: "no-store", headers: adminHeaders }),
  ]);

  return {
    policy: policyResponse.ok
      ? await policyResponse.json()
      : {
          managerApprovalThreshold: 500,
          requireProjectCodeWorkflows: ["EXPENSE_CLAIM", "PETTY_CASH_REIMBURSEMENT", "INTERNAL_PAYMENT_REQUEST"],
          duplicateFilenameDetection: true,
          invoiceNumberRequiredForVendorInvoices: true,
        },
    routing: routingResponse.ok
      ? await routingResponse.json()
      : {
          defaultApproverId: "manager.approver",
          financeReviewerId: "finance.reviewer",
          escalationWindowHours: 24,
        },
    connectors: connectorsResponse.ok ? await connectorsResponse.json() : [],
  };
}

export default async function AdminPoliciesPage() {
  const data = await getAdminData();

  return (
    <div className="workspace workspace-tight fade-up">
      <section className="workspace-header">
        <div>
          <span className="kicker">System administration</span>
          <h1>Policy and connector settings</h1>
          <p className="section-copy">
            Configure approval thresholds, routing defaults, and inspect runtime readiness from one place.
          </p>
        </div>
      </section>

      <section className="admin-layout">
        <aside className="stack-list">
          <div className="admin-nav">
            <div className="admin-link admin-link-active">Users & roles</div>
            <div className="admin-link">Workflow rules</div>
            <div className="admin-link">Approval thresholds</div>
            <div className="admin-link">Integrations</div>
          </div>
          <article className="rail-card rail-card-dark">
            <p className="rail-label">Copilot engine</p>
            <strong>99.8% automation accuracy</strong>
            <p className="muted">Operational readiness for mock intake, routing, and connector health inspection.</p>
          </article>
        </aside>

        <div className="stack-list">
          <PolicyAdminForm initialPolicy={data.policy} initialRouting={data.routing} />

          <section className="connector-grid">
            {data.connectors.length ? (
              data.connectors.map((connector: { connector: string; status: string; detail: string }) => (
                <article key={connector.connector} className="connector-card">
                  <p className="eyebrow">{connector.status}</p>
                  <h2>{connector.connector}</h2>
                  <p className="muted">{connector.detail}</p>
                </article>
              ))
            ) : (
              <>
                <article className="connector-card">
                  <p className="eyebrow">Connected</p>
                  <h2>NetSuite ERP</h2>
                  <p className="muted">Last sync: 12m ago</p>
                </article>
                <article className="connector-card">
                  <p className="eyebrow">Connected</p>
                  <h2>Mercury Bank</h2>
                  <p className="muted">Automated feed active</p>
                </article>
                <article className="connector-card">
                  <p className="eyebrow">Available</p>
                  <h2>Add integration</h2>
                  <p className="muted">Connector adapters can be enabled as the environment matures.</p>
                </article>
              </>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
