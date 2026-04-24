"use client";

import {
  DEFAULT_API_BASE_URL,
  approvalStageDependencyTypeSchema,
  approvalStageModeSchema,
  adminApprovalMatrixConfigSchema,
  adminDelegationConfigSchema,
  adminPolicyConfigSchema,
  adminRoutingConfigSchema,
  type AdminApprovalMatrixConfig,
  type AdminApprovalMatrixStageTemplate,
  type AdminDelegationRule,
  normalizeWorkflowTypeIdentifier,
  type AdminDelegationConfig,
  type AdminPolicyConfig,
  type AdminRoutingConfig,
} from "@finance-ops/shared";
import { useState, useTransition } from "react";
import { getApiBaseUrl, getClientAuthHeaders } from "../../lib/client-session";

const apiBaseUrl = getApiBaseUrl() ?? DEFAULT_API_BASE_URL;

type PolicyAdminFormProps = {
  initialPolicy: AdminPolicyConfig;
  initialRouting: AdminRoutingConfig;
  initialDelegation: AdminDelegationConfig;
  initialApprovalMatrix: AdminApprovalMatrixConfig;
};

export function PolicyAdminForm({
  initialPolicy,
  initialRouting,
  initialDelegation,
  initialApprovalMatrix,
}: PolicyAdminFormProps) {
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [delegationRules, setDelegationRules] = useState<AdminDelegationRule[]>(initialDelegation.rules);
  const [matrixTemplates, setMatrixTemplates] = useState<AdminApprovalMatrixStageTemplate[]>(
    initialApprovalMatrix.templates,
  );

  function toLocalDateTimeInput(isoValue?: string | null): string {
    if (!isoValue) {
      return "";
    }
    const parsed = new Date(isoValue);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    const tzOffsetMs = parsed.getTimezoneOffset() * 60_000;
    const local = new Date(parsed.getTime() - tzOffsetMs);
    return local.toISOString().slice(0, 16);
  }

  function toIsoFromLocalDateTime(localValue: string): string | undefined {
    const normalized = localValue.trim();
    if (!normalized) {
      return undefined;
    }
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed.toISOString();
  }

  function updateRule(index: number, patch: Partial<AdminDelegationRule>) {
    setDelegationRules((current) =>
      current.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)),
    );
  }

  function removeRule(index: number) {
    setDelegationRules((current) => current.filter((_, idx) => idx !== index));
  }

  function addRule() {
    setDelegationRules((current) => [
      ...current,
      {
        approverId: "",
        delegateTo: "",
        enabled: true,
        note: "",
      },
    ]);
  }

  function updateTemplate(index: number, patch: Partial<AdminApprovalMatrixStageTemplate>) {
    setMatrixTemplates((current) =>
      current.map((template, idx) => (idx === index ? { ...template, ...patch } : template)),
    );
  }

  function removeTemplate(index: number) {
    setMatrixTemplates((current) => current.filter((_, idx) => idx !== index));
  }

  function addTemplate() {
    setMatrixTemplates((current) => [
      ...current,
      {
        stageOrder: current.length + 1,
        label: "",
        approverIds: ["manager.approver"],
        mode: "SEQUENTIAL",
        dependencyType: "ALL_REQUIRED",
        requiredApprovals: 1,
        slaHours: initialRouting.escalationWindowHours,
        escalatesTo: "",
        enabled: true,
        conditions: {},
      },
    ]);
  }

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

        const delegationPayload = adminDelegationConfigSchema.parse({ rules: delegationRules });
        const approvalMatrixPayload = adminApprovalMatrixConfigSchema.parse({ templates: matrixTemplates });

        const headers = {
          "Content-Type": "application/json",
          ...getClientAuthHeaders(),
        };

        const [policyResponse, routingResponse, delegationResponse, approvalMatrixResponse] = await Promise.all([
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
          fetch(`${apiBaseUrl}/admin/delegations`, {
            method: "POST",
            headers,
            body: JSON.stringify(delegationPayload),
          }),
          fetch(`${apiBaseUrl}/admin/approval-matrix`, {
            method: "POST",
            headers,
            body: JSON.stringify(approvalMatrixPayload),
          }),
        ]);

        if (!policyResponse.ok || !routingResponse.ok || !delegationResponse.ok || !approvalMatrixResponse.ok) {
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

      <section className="form-section">
        <div>
          <p className="eyebrow">Approval matrix templates</p>
          <p className="muted">
            Configure stage templates with dependency and quorum rules. Matching templates are selected during routing
            based on workflow, amount, department, and cost-center conditions.
          </p>
        </div>
        <div className="delegation-rule-list">
          {matrixTemplates.length ? (
            matrixTemplates.map((template, index) => (
              <article key={`${template.stageOrder}-${index}`} className="delegation-rule-card matrix-template-card">
                <div className="delegation-rule-card-head">
                  <div className="matrix-template-title">
                    <strong>Template {index + 1}</strong>
                    <span className={`inline-status ${template.enabled ? "inline-status-success" : "inline-status-warning"}`}>
                      {template.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button-secondary delegation-remove-button"
                    onClick={() => removeTemplate(index)}
                    disabled={isPending}
                  >
                    Remove
                  </button>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span className="field-label">Stage order</span>
                    <input
                      type="number"
                      min={1}
                      value={template.stageOrder}
                      onChange={(event) => updateTemplate(index, { stageOrder: Number(event.target.value) || 1 })}
                      className="field-control"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Label</span>
                    <input
                      value={template.label}
                      onChange={(event) => updateTemplate(index, { label: event.target.value })}
                      className="field-control"
                      placeholder="Line manager approval"
                    />
                  </label>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span className="field-label">Approver IDs (comma-separated)</span>
                    <input
                      value={template.approverIds.join(", ")}
                      onChange={(event) =>
                        updateTemplate(index, {
                          approverIds: event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })
                      }
                      className="field-control"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Mode</span>
                    <select
                      value={template.mode}
                      onChange={(event) =>
                        updateTemplate(index, { mode: approvalStageModeSchema.parse(event.target.value) })
                      }
                      className="field-control"
                    >
                      {approvalStageModeSchema.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span className="field-label">Dependency type</span>
                    <select
                      value={template.dependencyType}
                      onChange={(event) =>
                        updateTemplate(index, {
                          dependencyType: approvalStageDependencyTypeSchema.parse(event.target.value),
                        })
                      }
                      className="field-control"
                    >
                      {approvalStageDependencyTypeSchema.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Required approvals</span>
                    <input
                      type="number"
                      min={1}
                      value={template.requiredApprovals ?? 1}
                      onChange={(event) =>
                        updateTemplate(index, { requiredApprovals: Number(event.target.value) || 1 })
                      }
                      className="field-control"
                    />
                  </label>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span className="field-label">SLA hours</span>
                    <input
                      type="number"
                      min={1}
                      value={template.slaHours ?? initialRouting.escalationWindowHours}
                      onChange={(event) => updateTemplate(index, { slaHours: Number(event.target.value) || null })}
                      className="field-control"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Escalates to</span>
                    <input
                      value={template.escalatesTo ?? ""}
                      onChange={(event) => updateTemplate(index, { escalatesTo: event.target.value || null })}
                      className="field-control"
                      placeholder="director.approver"
                    />
                  </label>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span className="field-label">Workflow filter (comma-separated)</span>
                    <input
                      value={template.conditions?.workflowTypes?.join(", ") ?? ""}
                      onChange={(event) =>
                        updateTemplate(index, {
                          conditions: {
                            ...template.conditions,
                            workflowTypes: event.target.value
                              .split(",")
                              .map((value) => value.trim())
                              .filter(Boolean)
                              .map(
                                (value) => normalizeWorkflowTypeIdentifier(value),
                              ) as NonNullable<AdminApprovalMatrixStageTemplate["conditions"]>["workflowTypes"],
                          },
                        })
                      }
                      className="field-control"
                      placeholder="EXPENSE_CLAIM, INTERNAL_PAYMENT_REQUEST"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Department filter (comma-separated)</span>
                    <input
                      value={template.conditions?.departments?.join(", ") ?? ""}
                      onChange={(event) =>
                        updateTemplate(index, {
                          conditions: {
                            ...template.conditions,
                            departments: event.target.value
                              .split(",")
                              .map((value) => value.trim())
                              .filter(Boolean),
                          },
                        })
                      }
                      className="field-control"
                      placeholder="procurement, treasury"
                    />
                  </label>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span className="field-label">Cost-center prefixes</span>
                    <input
                      value={template.conditions?.costCenterPrefixes?.join(", ") ?? ""}
                      onChange={(event) =>
                        updateTemplate(index, {
                          conditions: {
                            ...template.conditions,
                            costCenterPrefixes: event.target.value
                              .split(",")
                              .map((value) => value.trim())
                              .filter(Boolean),
                          },
                        })
                      }
                      className="field-control"
                      placeholder="FIN, OPS"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Amount range (min,max)</span>
                    <input
                      value={`${template.conditions?.minAmount ?? ""},${template.conditions?.maxAmount ?? ""}`}
                      onChange={(event) => {
                        const [minRaw, maxRaw] = event.target.value.split(",");
                        const minTrimmed = minRaw?.trim() ?? "";
                        const maxTrimmed = maxRaw?.trim() ?? "";
                        const minAmount = minTrimmed ? Number(minTrimmed) : Number.NaN;
                        const maxAmount = maxTrimmed ? Number(maxTrimmed) : Number.NaN;
                        updateTemplate(index, {
                          conditions: {
                            ...template.conditions,
                            minAmount: Number.isFinite(minAmount) ? minAmount : undefined,
                            maxAmount: Number.isFinite(maxAmount) ? maxAmount : undefined,
                          },
                        });
                      }}
                      className="field-control"
                      placeholder="500, 5000"
                    />
                  </label>
                </div>
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={template.enabled}
                    onChange={(event) => updateTemplate(index, { enabled: event.target.checked })}
                  />
                  <div>
                    <strong>Template active</strong>
                    <p className="muted">Inactive templates are ignored during matrix stage generation.</p>
                  </div>
                </label>
              </article>
            ))
          ) : (
            <div className="notice">
              <p className="muted">No matrix templates configured yet. Fallback service logic will be used.</p>
            </div>
          )}
        </div>
        <div className="action-row">
          <button type="button" className="button-secondary" onClick={addTemplate} disabled={isPending}>
            Add matrix template
          </button>
        </div>
      </section>

      <section className="form-section">
        <div>
          <p className="eyebrow">Out-of-office delegation</p>
          <p className="muted">
            Define explicit delegation rules for approvers who are out of office. Enabled rules auto-reassign tasks when
            created or when later stages open.
          </p>
        </div>
        <div className="delegation-rule-list">
          {delegationRules.length ? (
            delegationRules.map((rule, index) => (
              <article key={`${rule.approverId}-${index}`} className="delegation-rule-card">
                <div className="delegation-rule-card-head">
                  <strong>Rule {index + 1}</strong>
                  <button
                    type="button"
                    className="button-secondary delegation-remove-button"
                    onClick={() => removeRule(index)}
                    disabled={isPending}
                  >
                    Remove
                  </button>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span className="field-label">Approver ID</span>
                    <input
                      value={rule.approverId}
                      onChange={(event) => updateRule(index, { approverId: event.target.value })}
                      className="field-control"
                      placeholder="manager.approver"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Delegate to</span>
                    <input
                      value={rule.delegateTo}
                      onChange={(event) => updateRule(index, { delegateTo: event.target.value })}
                      className="field-control"
                      placeholder="backup.approver"
                    />
                  </label>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span className="field-label">Out-of-office until (local time)</span>
                    <input
                      type="datetime-local"
                      value={toLocalDateTimeInput(rule.outOfOfficeUntil)}
                      onChange={(event) =>
                        updateRule(index, {
                          outOfOfficeUntil: toIsoFromLocalDateTime(event.target.value),
                        })
                      }
                      className="field-control"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Status</span>
                    <select
                      value={rule.enabled ? "enabled" : "disabled"}
                      onChange={(event) => updateRule(index, { enabled: event.target.value === "enabled" })}
                      className="field-control"
                    >
                      <option value="enabled">Enabled</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">Note (optional)</span>
                  <textarea
                    value={rule.note ?? ""}
                    onChange={(event) => updateRule(index, { note: event.target.value })}
                    rows={2}
                    className="field-control"
                    placeholder="Optional context for auditability"
                  />
                </label>
              </article>
            ))
          ) : (
            <div className="notice">
              <p className="muted">No delegation rules configured yet.</p>
            </div>
          )}
        </div>
        <div className="action-row">
          <button type="button" className="button-secondary" onClick={addRule} disabled={isPending}>
            Add delegation rule
          </button>
        </div>
        <div className="notice">
          <strong>Active delegation preview</strong>
          <div className="stack-list delegation-preview-list">
            {delegationRules
              .filter((rule) => {
                if (!rule.enabled) {
                  return false;
                }
                if (!rule.outOfOfficeUntil) {
                  return true;
                }
                const untilMs = Date.parse(rule.outOfOfficeUntil);
                return Number.isFinite(untilMs) && untilMs > Date.now();
              })
              .map((rule, idx) => (
                <p key={`active-${rule.approverId}-${idx}`} className="muted">
                  {rule.approverId} {"->"} {rule.delegateTo}
                  {rule.outOfOfficeUntil ? ` (until ${new Date(rule.outOfOfficeUntil).toLocaleString()})` : " (no end date)"}
                </p>
              ))}
            {!delegationRules.some((rule) => {
              if (!rule.enabled) {
                return false;
              }
              if (!rule.outOfOfficeUntil) {
                return true;
              }
              const untilMs = Date.parse(rule.outOfOfficeUntil);
              return Number.isFinite(untilMs) && untilMs > Date.now();
            }) ? <p className="muted">No active delegation rules right now.</p> : null}
          </div>
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
