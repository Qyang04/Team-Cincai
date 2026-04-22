# API Runtime Handoff

This document is the current Role 2 backend handoff for the SME Finance Ops Copilot API.

It covers:
- known-safe endpoints for the frontend lanes
- required mock-auth headers
- additive response fields exposed by the backend
- repeatable demo and verification scenarios

## Role 2 Done Handoff

Role 2 is complete for the scope defined in `role-2-backend-workflow-core-plan.md`.

Completed backend outcomes:
- workflow transitions reject stale callers and invalid runtime drift
- approval request-info loops reopen the pending task correctly
- admin routing config controls real approver and finance-review assignment
- case detail is the strongest one-case API surface in the repo
- approval and finance-review queues return stable operator-ready case context
- repeatable scenario verification exists in tests and manual backend notes

Verified status:
- `npm.cmd run test --workspace @finance-ops/api` passes
- `npm.cmd run test` passes
- `npm.cmd run build` passes when rerun outside the sandbox in this Windows environment

Handoffs:
- Role 1 should now formalize shared contracts from the live case-detail and queue surfaces
- Role 3 can rely on submit, clarification, case detail, and export-state behavior
- Role 4 can rely on approval queue re-entry, finance-review queue visibility, and guarded route expectations

Not part of Role 2 done criteria:
- approval matrix depth
- FX reconciliation
- net/tax/gross accounting validation
- richer duplicate reasoning
- deeper workflow-specific finance nuance from later master-plan phases

## Mock Auth Headers

The API currently runs in mock-auth mode by default.

Use these headers for guarded routes:

| Surface | Required headers |
| --- | --- |
| Requester flows | `x-mock-role: REQUESTER`, `x-mock-user-id: <requester-id>` |
| Approval flows | `x-mock-role: APPROVER`, `x-mock-user-id: <approver-id>` |
| Finance review flows | `x-mock-role: FINANCE_REVIEWER`, `x-mock-user-id: <reviewer-id>` |
| Admin flows | `x-mock-role: ADMIN`, `x-mock-user-id: <admin-id>` |

Unprotected endpoints still work without explicit headers, but Role 3 and Role 4 should always send the correct mock headers to match real runtime behavior.

## Known-Safe Endpoints

### Requester surfaces
- `POST /cases`
- `POST /cases/:id/submit`
- `GET /cases/:id`
- `GET /cases/:id/questions`
- `POST /cases/:id/questions/:questionId/respond`
- `GET /cases/:id/export`
- `POST /cases/:id/export`

### Approval surfaces
- `GET /cases/approvals/tasks`
- `POST /cases/approvals/:taskId/approve`
- `POST /cases/approvals/:taskId/reject`
- `POST /cases/approvals/:taskId/request-info`

### Finance review surfaces
- `GET /cases/finance-review/cases`
- `POST /cases/finance-review/:reviewId/approve`
- `POST /cases/finance-review/:reviewId/reject`
- `POST /cases/finance-review/:reviewId/send-back`

### Admin surfaces
- `GET /admin/policies`
- `POST /admin/policies`
- `GET /admin/routing`
- `POST /admin/routing`
- `GET /admin/connectors`

## Current Response Notes

### `GET /cases/:id`

The case-detail route is the strongest API surface in the repo right now.

Existing nested arrays are preserved:
- `artifacts`
- `extractionResults`
- `openQuestions`
- `policyResults`
- `approvalTasks`
- `financeReviews`
- `exportRecords`
- `workflowTransitions`
- `auditEvents`

Additive top-level summary fields are also exposed:
- `stage`
- `manualActionRequired`
- `latestExtraction`
- `latestPolicyResult`
- `latestApprovalTask`
- `latestFinanceReview`
- `latestExportRecord`
- `reasoningSummary`
- `recommendedAction`
- `failureMode`
- `exportReadinessSummary`

Important nullable behavior:
- `latestExtraction`, `latestPolicyResult`, `latestApprovalTask`, `latestFinanceReview`, and `latestExportRecord` may be `null`
- `reasoningSummary`, `recommendedAction`, and `failureMode` may be `null`
- `exportReadinessSummary` is always present

### `GET /cases/approvals/tasks`

Queue rows are actionable approval tasks only.

Current stable shape:
- task-level fields such as `id`, `status`, `decision`, `decisionReason`, `dueAt`, `createdAt`, `approverId`
- nested `case` context via Prisma include, including `id`, `workflowType`, `status`, `priority`, and `requesterId`

Behavior guarantee:
- if an approver requests info and the requester answers all outstanding approver questions, the latest `INFO_REQUESTED` task is reopened to `PENDING` and reappears in this queue

### `GET /cases/finance-review/cases`

Queue rows are open finance-review items only.

Current stable shape:
- review-level fields such as `id`, `note`, `outcome`, `reviewerId`, `createdAt`, `updatedAt`
- nested `case` context via Prisma include, including `id`, `workflowType`, `status`, `priority`, and `requesterId`

Behavior guarantee:
- if policy routing escalates a case into finance review, a new open finance-review item is enqueued and becomes visible in this queue

## Current Runtime Truth

These are now true in the backend:
- transition writes reject stale `from` states instead of silently overwriting case status
- policy routing uses admin-configured approver and finance-reviewer IDs
- approval request-info loops restore the approval queue item correctly
- export failure transitions the case into `RECOVERABLE_EXCEPTION`
- successful export transitions the case through `EXPORTED` and into `CLOSED`
- case detail exposes summary metadata without breaking the legacy array-based response shape

These are not fully implemented yet:
- multi-tier approval matrix logic
- FX reconciliation
- net/tax/gross validation
- richer duplicate reasoning beyond current filename-based mock signals
- persisted database columns for failure-mode metadata

## Repeatable Demo Scenarios

### 1. Expense claim happy path
1. Create a case as `REQUESTER`
2. Submit with notes containing a project code such as `OPS-12`
3. Confirm case reaches `AWAITING_APPROVAL`
4. Open approval queue as `APPROVER`
5. Approve the task
6. Confirm case reaches `EXPORT_READY`
7. Trigger export
8. Confirm case reaches `CLOSED`

### 2. Clarification loop
1. Create a case as `REQUESTER`
2. Submit without a project code
3. Confirm case reaches `AWAITING_REQUESTER_INFO`
4. Answer the question with a project code
5. Confirm case re-enters policy review and routes onward

### 3. Approval request-info loop
1. Route a case to `AWAITING_APPROVAL`
2. As `APPROVER`, call `request-info`
3. Confirm case reaches `AWAITING_APPROVER_INFO_RESPONSE`
4. As `REQUESTER`, answer the new approver question
5. Confirm the case returns to `AWAITING_APPROVAL`
6. Confirm the approval task is back in the pending queue

### 4. Finance review path
1. Submit a case that triggers finance review, such as one above the manager threshold
2. Confirm case reaches `FINANCE_REVIEW`
3. Approve or reject from the finance-review queue
4. Confirm the resulting case state matches the action

### 5. Finance send-back reroute loop
1. Submit a case that routes to `FINANCE_REVIEW`
2. As `FINANCE_REVIEWER`, call `send-back` with a note explaining the missing evidence
3. Confirm case reaches `AWAITING_REQUESTER_INFO`
4. As `REQUESTER`, answer the finance-review clarification
5. Confirm the case re-enters `POLICY_REVIEW`
6. Confirm policy routing continues from live backend state

### 6. Export failure path
1. Submit a case whose artifact filename includes `fail-export`
2. Route it to `EXPORT_READY`
3. Trigger export
4. Confirm export record becomes `FAILED`
5. Confirm case reaches `RECOVERABLE_EXCEPTION`
6. Confirm case detail exposes `failureMode: EXPORT_FAILURE`

## Verification Commands

Use these before handing backend work to the frontend lanes:

```powershell
npm.cmd run test --workspace @finance-ops/api
npm.cmd run build
```

Expected current result:
- API tests pass
- workspace build passes
- Next.js build may need to be rerun outside the sandbox in this environment due to the known Windows `spawn EPERM` sandbox issue
