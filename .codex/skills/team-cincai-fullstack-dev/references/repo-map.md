# Repo Map

## Workspace Layout

- `apps/web`: Next.js App Router frontend for requester, approver, finance-review, and admin lanes.
- `apps/api`: NestJS backend for orchestration, policy, approvals, finance review, exports, auth, and persistence.
- `packages/shared`: shared domain enums, Zod schemas, and API contracts.

## Core Commands

```powershell
npm.cmd run dev:web
npm.cmd run dev:api
npm.cmd run build
npm.cmd run test
npm.cmd run test --workspace @finance-ops/api
docker compose up -d
npx prisma db push --schema apps/api/prisma/schema.prisma
```

## Frontend Entry Points

- `apps/web/app/page.tsx`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/cases/new/page.tsx`
- `apps/web/app/cases/[id]/page.tsx`
- `apps/web/app/approvals/page.tsx`
- `apps/web/app/finance-review/page.tsx`
- `apps/web/app/admin/policies/page.tsx`

Useful supporting files:

- `apps/web/app/lib/server-api.ts`
- `apps/web/app/components/*`

## Backend Entry Points

- `apps/api/src/modules/cases.controller.ts`
- `apps/api/src/modules/workflow-orchestrator.service.ts`
- `apps/api/src/modules/workflow.service.ts`
- `apps/api/src/modules/policy.service.ts`
- `apps/api/src/modules/approvals.service.ts`
- `apps/api/src/modules/finance-review.service.ts`
- `apps/api/src/modules/exports.service.ts`
- `apps/api/src/modules/case-detail.service.ts`
- `apps/api/prisma/schema.prisma`

## Shared Contract Files

- `packages/shared/src/contracts/*`
- `packages/shared/src/schemas/case.ts`
- `packages/shared/src/domain/workflow.ts`
- `packages/shared/src/domain/types.ts`
- `packages/shared/src/index.ts`

## Mock Auth Headers

Use these headers for guarded backend routes during development:

- requester: `x-mock-role: REQUESTER`, `x-mock-user-id: <requester-id>`
- approver: `x-mock-role: APPROVER`, `x-mock-user-id: <approver-id>`
- finance reviewer: `x-mock-role: FINANCE_REVIEWER`, `x-mock-user-id: <reviewer-id>`
- admin: `x-mock-role: ADMIN`, `x-mock-user-id: <admin-id>`

## Stable Backend Surfaces

Requester:

- `POST /cases`
- `POST /cases/:id/submit`
- `GET /cases/:id`
- `GET /cases/:id/questions`
- `POST /cases/:id/questions/:questionId/respond`
- `GET /cases/:id/export`
- `POST /cases/:id/export`

Approvals:

- `GET /cases/approvals/tasks`
- `POST /cases/approvals/:taskId/approve`
- `POST /cases/approvals/:taskId/reject`
- `POST /cases/approvals/:taskId/request-info`

Finance review:

- `GET /cases/finance-review/cases`
- `POST /cases/finance-review/:reviewId/approve`
- `POST /cases/finance-review/:reviewId/reject`
- `POST /cases/finance-review/:reviewId/send-back`

Admin:

- `GET /admin/policies`
- `POST /admin/policies`
- `GET /admin/routing`
- `POST /admin/routing`
- `GET /admin/connectors`

## Current Backend Guarantees

- Workflow transitions reject stale `from` states.
- Approval request-info can reopen the pending approval task after requester answers.
- Admin routing controls approver and finance-review assignment.
- Case detail is the strongest single-case API surface.
- Export failure can move a case to `RECOVERABLE_EXCEPTION`.
- Successful export can move a case through `EXPORTED` into `CLOSED`.
