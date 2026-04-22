# Shared Contract Note

This package is the canonical home for cross-app workflow enums, request schemas, and the current UI-facing API contracts for the SME Finance Ops Copilot.

Role 1 completion lives in:
- `packages/shared/src/contracts/case.ts`
- `packages/shared/src/contracts/admin.ts`
- `packages/shared/src/contracts/api.ts`
- `packages/shared/src/schemas/case.ts`
- `packages/shared/src/domain/types.ts`

## Current Live Surfaces

These are the live contracts the current web app now consumes from `@finance-ops/shared`:

| Surface | Contract |
| --- | --- |
| `POST /cases` | `CreateCaseResponse` |
| `POST /cases/:id/submit` | `CaseSubmissionResponse` |
| `GET /cases/:id` | `CaseDetailResponse` |
| `GET /cases/approvals/tasks` | `ApprovalQueueItem[]` |
| `GET /cases/finance-review/cases` | `FinanceReviewQueueItem[]` |
| `GET /admin/policies` | `AdminPolicyConfig` |
| `GET /admin/routing` | `AdminRoutingConfig` |
| `GET /admin/connectors` | `AdminConnectorStatus[]` |

Current web pages using these contracts:
- `apps/web/app/cases/new/case-form.tsx`
- `apps/web/app/cases/[id]/page.tsx`
- `apps/web/app/approvals/page.tsx`
- `apps/web/app/finance-review/page.tsx`
- `apps/web/app/admin/policies/page.tsx`
- `apps/web/app/admin/policies/policy-admin-form.tsx`

## Payload Expectations By Page

### `/cases/new`
- `CreateCaseResponse` is the draft case record returned from `POST /cases`.
- `CaseSubmissionResponse` is the current submit result returned from `POST /cases/:id/submit`.
- `policyResult` can be `null` when AI intake routes the case to clarification before policy review.

### `/cases/[id]`
- `CaseDetailResponse` is the strongest one-case API surface in the repo.
- The page should prefer additive summary fields over inferring from nested arrays:
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
- The legacy arrays remain part of the contract because the page still renders full artifacts, questions, tasks, reviews, transitions, and audit history.

### `/approvals`
- `ApprovalQueueItem[]` is the approval queue contract.
- Each row includes task-level fields plus nested `case` summary context.
- The queue remains truthful after request-for-info cycles because Role 2 restores the task to `PENDING`.

### `/finance-review`
- `FinanceReviewQueueItem[]` is the finance-review queue contract.
- Each row includes review-level fields plus nested `case` summary context.
- The queue reflects live policy escalation and live finance send-back loops.

### `/admin/policies`
- `AdminPolicyConfig` and `AdminRoutingConfig` are the editable admin config contracts.
- `AdminConnectorStatus[]` is the live connector-health surface.
- The page still contains UI fallback cards when connector data is unavailable, but the API-backed contract is now explicit.

## Nullability And Stringly Fields

The current backend truth includes important nullable fields:
- `CaseDetailResponse.latestExtraction`
- `CaseDetailResponse.latestPolicyResult`
- `CaseDetailResponse.latestApprovalTask`
- `CaseDetailResponse.latestFinanceReview`
- `CaseDetailResponse.latestExportRecord`
- `CaseDetailResponse.reasoningSummary`
- `CaseDetailResponse.recommendedAction`
- `CaseDetailResponse.failureMode`
- `CaseDetailResponse.assignedTo`
- `ApprovalQueueItem.decision`
- `ApprovalQueueItem.decisionReason`
- `ApprovalQueueItem.dueAt`
- `FinanceReviewQueueItem.reviewerId`
- `FinanceReviewQueueItem.note`
- `FinanceReviewQueueItem.outcome`

These fields are still stringly in the backend today, so the shared contracts keep them as `string` instead of pretending they are closed enums:
- artifact `processingStatus`
- open-question `status` and `source`
- approval-task `status` and `decision`
- finance-review `outcome`
- export-record `status`

This is deliberate. The backend persists those values as strings today, and the contracts should reflect current runtime truth instead of inventing stricter guarantees than the API actually provides.

## Real, Mock-Backed, And Planned

Currently real and API-backed:
- case detail arrays and additive summary metadata
- approval queue rows
- finance-review queue rows
- admin policy and routing config
- connector health rows

Currently mock-backed but still live product surfaces:
- AI extraction and reasoning content
- connector health statuses
- export connector name defaults such as `mock-accounting-export`
- auth identity and role selection via mock headers

Reserved in shared types or schemas, but not fully live in backend behavior yet:
- FX and realized-settlement structured fields
- net, tax, and gross normalization fields
- `reconciliationFlags`
- `approvalRequirement`

## Gaps Against `master-plan.md`

Role 1 formalizes the current backend truth and documents the remaining gaps to the master plan:

- Multi-tier approval matrix is not live yet.
- FX reconciliation behavior is not live yet.
- Net, tax, and gross validation is not live yet.
- Duplicate reasoning remains shallow compared with the master plan.
- Several workflow sub-statuses still use string fields instead of formal shared enums.

To keep the contract layer forward-compatible, `StructuredFields` and the shared extraction schemas now reserve the master-plan finance fields as optional properties:
- `originalAmount`
- `originalCurrency`
- `baseCurrency`
- `estimatedFxRate`
- `estimatedBaseAmount`
- `realizedBaseAmount`
- `realizedFxSource`
- `netAmount`
- `taxAmount`
- `grossAmount`
- `vendorTaxId`
- `amountDiscrepancyFlag`
- `taxMismatchFlag`

## Verification

Verified after the Role 1 changes:
- `npm.cmd run test --workspace @finance-ops/api`
- `npm.cmd run build`

Both passed after the web build was rerun outside the sandbox because the Windows sandbox hits the known `spawn EPERM` issue during `next build`.
