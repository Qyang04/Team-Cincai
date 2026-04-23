"use client";

import {
  DEFAULT_API_BASE_URL,
  adminPolicyConfigSchema,
  adminRoutingConfigSchema,
  normalizeWorkflowTypeIdentifier,
  type AdminPolicyConfig,
  type AdminRoutingConfig,
} from "@finance-ops/shared";
import { useState, useTransition } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

type PolicyAdminFormProps = {
  initialPolicy: AdminPolicyConfig;
  initialRouting: AdminRoutingConfig;
};

export function PolicyAdminForm({ initialPolicy, initialRouting }: PolicyAdminFormProps) {
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setMessage(null);

    startTransition(async () => {
      try {
        const policyPayload = adminPolicyConfigSchema.parse({
          managerApprovalThreshold: Number(
            formData.get("managerApprovalThreshold") ?? initialPolicy.managerApprovalThreshold,
          ),
          requireProjectCodeWorkflows: String(formData.get("requireProjectCodeWorkflows") ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => normalizeWorkflowTypeIdentifier(item)),
          duplicateFilenameDetection: formData.get("duplicateFilenameDetection") === "on",
          invoiceNumberRequiredForVendorInvoices:
            formData.get("invoiceNumberRequiredForVendorInvoices") === "on",
        });

        const routingPayload = adminRoutingConfigSchema.parse({
          defaultApproverId: String(formData.get("defaultApproverId") ?? initialRouting.defaultApproverId),
          financeReviewerId: String(formData.get("financeReviewerId") ?? initialRouting.financeReviewerId),
          escalationWindowHours: Number(
            formData.get("escalationWindowHours") ?? initialRouting.escalationWindowHours,
          ),
        });

        const headers = {
          "Content-Type": "application/json",
          "x-mock-role": "ADMIN",
          "x-mock-user-id": "admin.user",
        };

        const [policyResponse, routingResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/admin/policies`, {
            method: "POST",
            headers,
            body: JSON.stringify(policyPayload),
          }),
          fetch(`${apiBaseUrl}/admin/routing`, {
            method: "POST",
            headers,
            body: JSON.stringify(routingPayload),
          }),
        ]);

        if (!policyResponse.ok || !routingResponse.ok) {
          throw new Error("Failed to save admin settings.");
        }

        setMessage({
          text: "Settings saved. Refresh the page to confirm the latest persisted values.",
          tone: "success",
        });
      } catch (error) {
        setMessage({
          text: error instanceof Error ? error.message : "Unexpected settings error.",
          tone: "error",
        });
      }
    });
  }

  return (
    <form action={handleSubmit} className="surface admin-form">
      <div className="surface-head">
        <div>
          <p className="eyebrow">Editable configuration</p>
          <h2>Policy and routing controls</h2>
        </div>
        <button type="submit" disabled={isPending} className="button-primary">
          {isPending ? "Saving..." : "Save settings"}
        </button>
      </div>

      <section className="form-section">
        <div>
          <p className="eyebrow">Approval thresholds</p>
          <p className="muted">Set the current handoff thresholds used by policy and routing.</p>
        </div>
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Manager approval threshold</span>
            <input
              name="managerApprovalThreshold"
              type="number"
              defaultValue={initialPolicy.managerApprovalThreshold}
              className="field-control"
            />
          </label>
          <label className="field">
            <span className="field-label">Escalation window hours</span>
            <input
              name="escalationWindowHours"
              type="number"
              defaultValue={initialRouting.escalationWindowHours}
              className="field-control"
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div>
          <p className="eyebrow">Routing defaults</p>
          <p className="muted">Keep the default approver and finance reviewer aligned with current ownership.</p>
        </div>
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Default approver ID</span>
            <input name="defaultApproverId" defaultValue={initialRouting.defaultApproverId} className="field-control" />
          </label>
          <label className="field">
            <span className="field-label">Finance reviewer ID</span>
            <input name="financeReviewerId" defaultValue={initialRouting.financeReviewerId} className="field-control" />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div>
          <p className="eyebrow">Workflow configuration</p>
          <p className="muted">These settings affect how incomplete or duplicate evidence is handled during intake.</p>
        </div>
        <label className="field">
          <span className="field-label">Workflows requiring project code</span>
          <input
            name="requireProjectCodeWorkflows"
            defaultValue={initialPolicy.requireProjectCodeWorkflows.join(", ")}
            className="field-control"
          />
        </label>
        <div className="stack-list">
          <label className="toggle-field">
            <input name="duplicateFilenameDetection" type="checkbox" defaultChecked={initialPolicy.duplicateFilenameDetection} />
            <div>
              <strong>Duplicate filename detection</strong>
              <p className="muted">Raise a signal when uploaded evidence matches earlier submissions.</p>
            </div>
          </label>
          <label className="toggle-field">
            <input
              name="invoiceNumberRequiredForVendorInvoices"
              type="checkbox"
              defaultChecked={initialPolicy.invoiceNumberRequiredForVendorInvoices}
            />
            <div>
              <strong>Require invoice number for vendor invoices</strong>
              <p className="muted">Prevent vendor approval routing when key source fields are still missing.</p>
            </div>
          </label>
        </div>
      </section>

      {message ? (
        <div className={`notice ${message.tone === "success" ? "notice-success" : "notice-error"}`}>
          <p className="muted">{message.text}</p>
        </div>
      ) : null}
    </form>
  );
}
