"use client";

import { useState, useTransition } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type PolicyAdminFormProps = {
  initialPolicy: {
    managerApprovalThreshold: number;
    requireProjectCodeWorkflows: string[];
    duplicateFilenameDetection: boolean;
    invoiceNumberRequiredForVendorInvoices: boolean;
  };
  initialRouting: {
    defaultApproverId: string;
    financeReviewerId: string;
    escalationWindowHours: number;
  };
};

export function PolicyAdminForm({ initialPolicy, initialRouting }: PolicyAdminFormProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setMessage(null);

    const policyPayload = {
      managerApprovalThreshold: Number(formData.get("managerApprovalThreshold") ?? initialPolicy.managerApprovalThreshold),
      requireProjectCodeWorkflows: String(formData.get("requireProjectCodeWorkflows") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      duplicateFilenameDetection: formData.get("duplicateFilenameDetection") === "on",
      invoiceNumberRequiredForVendorInvoices: formData.get("invoiceNumberRequiredForVendorInvoices") === "on",
    };

    const routingPayload = {
      defaultApproverId: String(formData.get("defaultApproverId") ?? initialRouting.defaultApproverId),
      financeReviewerId: String(formData.get("financeReviewerId") ?? initialRouting.financeReviewerId),
      escalationWindowHours: Number(formData.get("escalationWindowHours") ?? initialRouting.escalationWindowHours),
    };

    startTransition(async () => {
      try {
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

        setMessage("Settings saved. Refresh to confirm the updated values.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unexpected settings error.");
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
          <p className="muted">Set financial limits and workflow rules for automated versus manual review.</p>
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
          <p className="muted">Keep the default approver and finance reviewer aligned with current operating ownership.</p>
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
          <p className="muted">These settings shape how incomplete or duplicate evidence is handled during intake.</p>
        </div>
        <label className="field">
          <span className="field-label">Require project code workflows</span>
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

      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
