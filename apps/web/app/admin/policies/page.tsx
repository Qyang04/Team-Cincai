import {
  adminApprovalMatrixConfigSchema,
  DEFAULT_API_BASE_URL,
  adminDelegationConfigSchema,
  adminConnectorsResponseSchema,
  adminPolicyConfigSchema,
  adminRoutingConfigSchema,
  type AdminApprovalMatrixConfig,
  type AdminDelegationConfig,
  type AdminConnectorStatus,
  type AdminPolicyConfig,
  type AdminRoutingConfig,
} from "@finance-ops/shared";
import { getServerAuthHeaders } from "../../lib/session";
import { fetchApiJson } from "../../lib/server-api";
import { PolicyAdminForm } from "./policy-admin-form";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

const fallbackPolicy: AdminPolicyConfig = {
  managerApprovalThreshold: 500,
  requireProjectCodeWorkflows: [
    "EXPENSE_CLAIM",
    "PETTY_CASH_REIMBURSEMENT",
    "INTERNAL_PAYMENT_REQUEST",
  ],
  duplicateFilenameDetection: true,
  duplicateEvidenceDetection: true,
  invoiceNumberRequiredForVendorInvoices: true,
};

const fallbackRouting: AdminRoutingConfig = {
  defaultApproverId: "manager.approver",
  financeReviewerId: "finance.reviewer",
  escalationWindowHours: 24,
};

async function getAdminData(): Promise<{
  policy: AdminPolicyConfig;
  routing: AdminRoutingConfig;
  delegation: AdminDelegationConfig;
  approvalMatrix: AdminApprovalMatrixConfig;
  connectors: AdminConnectorStatus[];
  sourceState: {
    policy: boolean;
    routing: boolean;
    delegation: boolean;
    approvalMatrix: boolean;
    connectors: boolean;
  };
  errors: string[];
}> {
  const adminHeaders = await getServerAuthHeaders();
  const [policyResult, routingResult, connectorsResult, delegationResult, approvalMatrixResult] = await Promise.all([
    fetchApiJson<AdminPolicyConfig>({
      url: `${apiBaseUrl}/admin/policies`,
      init: { cache: "no-store", headers: adminHeaders },
      fallbackData: fallbackPolicy,
      resourceLabel: "Admin policy settings",
      parse: (value) => adminPolicyConfigSchema.parse(value),
    }),
    fetchApiJson<AdminRoutingConfig>({
      url: `${apiBaseUrl}/admin/routing`,
      init: { cache: "no-store", headers: adminHeaders },
      fallbackData: fallbackRouting,
      resourceLabel: "Admin routing settings",
      parse: (value) => adminRoutingConfigSchema.parse(value),
    }),
    fetchApiJson<AdminConnectorStatus[]>({
      url: `${apiBaseUrl}/admin/connectors`,
      init: { cache: "no-store", headers: adminHeaders },
      fallbackData: [],
      resourceLabel: "Admin connector status",
      parse: (value) => adminConnectorsResponseSchema.parse(value),
    }),
    fetchApiJson<AdminDelegationConfig>({
      url: `${apiBaseUrl}/admin/delegations`,
      init: { cache: "no-store", headers: adminHeaders },
      fallbackData: { rules: [] },
      resourceLabel: "Admin delegation settings",
      parse: (value) => adminDelegationConfigSchema.parse(value),
    }),
    fetchApiJson<AdminApprovalMatrixConfig>({
      url: `${apiBaseUrl}/admin/approval-matrix`,
      init: { cache: "no-store", headers: adminHeaders },
      fallbackData: { templates: [] },
      resourceLabel: "Admin approval matrix settings",
      parse: (value) => adminApprovalMatrixConfigSchema.parse(value),
    }),
  ]);

  const errors = [policyResult, routingResult, delegationResult, approvalMatrixResult, connectorsResult]
    .filter((result) => !result.ok)
    .map((result) => result.message);

  return {
    policy: policyResult.data,
    routing: routingResult.data,
    delegation: delegationResult.data,
    approvalMatrix: approvalMatrixResult.data,
    connectors: connectorsResult.data,
    sourceState: {
      policy: policyResult.ok,
      routing: routingResult.ok,
      delegation: delegationResult.ok,
      approvalMatrix: approvalMatrixResult.ok,
      connectors: connectorsResult.ok,
    },
    errors,
  };
}

export default async function AdminPoliciesPage() {
  const data = await getAdminData();
  const showingFallback =
    !data.sourceState.policy ||
    !data.sourceState.routing ||
    !data.sourceState.delegation ||
    !data.sourceState.approvalMatrix;

  return (
    <div className="workspace workspace-tight fade-up">
      <section className="workspace-header">
        <div>
          <span className="kicker">System administration</span>
          <h1>Policy settings</h1>
          <p className="section-copy">
            Manage the current admin surface: policy thresholds, routing defaults, and connector status.
          </p>
        </div>
      </section>

      <section className="admin-layout">
        <aside className="stack-list">
          <div className="admin-nav">
            <div className="admin-link admin-link-active">Policy controls</div>
            <div className="admin-link">Routing defaults</div>
            <div className="admin-link">Connector status</div>
          </div>
          <article className="rail-card rail-card-dark">
            <p className="rail-label">Current scope</p>
            <strong>Keep this page focused on real configuration</strong>
            <p className="muted">Avoid placeholder admin modules until the backend exposes them.</p>
          </article>
        </aside>

        <div className="stack-list">
          {showingFallback ? (
            <div className="notice">
              <strong>Live admin settings could not be loaded.</strong>
              <p className="muted">
                The form below is showing local fallback values because the policy or routing endpoint is unavailable at{" "}
                <code>{apiBaseUrl}</code>.
              </p>
              {data.errors.length ? (
                <p className="muted">{data.errors.join(" ")}</p>
              ) : null}
            </div>
          ) : null}

          <PolicyAdminForm
            initialPolicy={data.policy}
            initialRouting={data.routing}
            initialDelegation={data.delegation}
            initialApprovalMatrix={data.approvalMatrix}
          />

          <section className="connector-grid">
            {data.connectors.length ? (
              data.connectors.map((connector) => (
                <article key={connector.connector} className="connector-card">
                  <p className="eyebrow">{connector.status}</p>
                  <h2>{connector.connector}</h2>
                  <p className="muted">{connector.detail}</p>
                </article>
              ))
            ) : data.sourceState.connectors ? (
              <article className="surface" style={{ gridColumn: "1 / -1" }}>
                <div className="surface-head">
                  <div>
                    <p className="eyebrow">Connector status</p>
                    <h2>No connectors configured yet</h2>
                  </div>
                </div>
                <p className="muted">
                  The connector status endpoint responded successfully, but it did not return any configured adapters.
                </p>
              </article>
            ) : (
              <article className="surface" style={{ gridColumn: "1 / -1" }}>
                <div className="surface-head">
                  <div>
                    <p className="eyebrow">Connector status</p>
                    <h2>Status unavailable</h2>
                  </div>
                </div>
                <p className="muted">
                  Start the API and enable the connector status endpoint to inspect real integration readiness here.
                </p>
              </article>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
