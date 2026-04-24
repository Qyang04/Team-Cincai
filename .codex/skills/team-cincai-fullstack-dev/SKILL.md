---
name: team-cincai-fullstack-dev
description: Implement and modify frontend, backend, and shared-contract work in the SME Finance Ops Copilot monorepo. Use when Codex needs to add or change Next.js app-router UI in `apps/web`, NestJS workflow/API logic in `apps/api`, Prisma-backed backend behavior, or shared Zod/domain contracts in `packages/shared`, especially when a feature spans multiple layers.
---

# Team Cincai Full-Stack Dev

Implement changes in this repo from the shared contract outward.

Prefer small vertical slices that keep `packages/shared`, `apps/api`, and `apps/web` aligned instead of patching one layer in isolation and leaving the others stale.

## Quick Start

1. Read [references/repo-map.md](references/repo-map.md).
2. Read `master-plan.md` to understand the overall product idea, intended architecture, and roadmap before making implementation decisions.
3. Identify the affected workflow lane: requester, approver, finance-review, or admin.
4. Start from `packages/shared` if the request changes payload shape, enums, route contracts, or validation.
5. Update backend behavior in `apps/api` next.
6. Update UI consumption and forms in `apps/web` last.
7. Validate the smallest useful command set before finishing.

## Working Rules

- Preserve the monorepo split:
  `packages/shared` owns reusable types, schemas, contracts, and workflow enums.
  `apps/api` owns orchestration, policies, approvals, exports, auth guards, and persistence.
  `apps/web` owns route UI, page composition, and API consumption.
- Use `master-plan.md` to anchor implementation choices to the intended product direction when the local codebase is incomplete, ambiguous, or still scaffold-level.
- Keep controllers thin in the API. Put branching business logic in services.
- Keep frontend pages focused on composition. Put reusable UI and request helpers in nearby components or `app/lib`.
- Treat mock-auth headers as runtime requirements for guarded routes during development.
- Do not invent a parallel contract shape in the web app. Export or extend it in `packages/shared`.
- Preserve additive compatibility where possible. If a response shape changes, update all consumers in the same task.

## Change Strategy

### Shared First

Start in `packages/shared` when any of the following change:

- request or response payloads
- workflow statuses or workflow types
- Zod validation
- cross-app constants such as API base URL defaults

Touch likely files first:

- `packages/shared/src/contracts/*`
- `packages/shared/src/schemas/*`
- `packages/shared/src/domain/*`
- `packages/shared/src/index.ts`

### Backend Second

Implement backend work in `apps/api` after the contract is clear.

- Put HTTP surface changes in controllers only after the service behavior exists.
- Prefer extending existing services before creating new modules.
- Keep workflow transitions explicit and validate `from -> to` movement through the workflow services instead of ad hoc status writes.
- For route changes, check whether the behavior belongs in:
  `workflow-orchestrator.service.ts` for multi-step flows,
  `workflow.service.ts` for state transitions,
  lane-specific services such as approvals, finance review, exports, policy, or intake for domain logic.
- When a feature touches persistence, inspect `apps/api/prisma/schema.prisma` and keep service assumptions consistent with the schema.

### Frontend Last

Implement UI work in `apps/web` after backend behavior is stable.

- Follow the existing Next.js App Router structure under `apps/web/app`.
- Keep route-level pages server-friendly unless interactivity is required; use `"use client"` only for interactive components and forms.
- Reuse `app/lib/server-api.ts` patterns for resilient fetch/error handling when loading server data.
- Preserve the current workflow-oriented route structure:
  `/cases/new`
  `/cases/[id]`
  `/approvals`
  `/finance-review`
  `/admin/policies`
- Keep mock headers and API base URL behavior aligned with the backend handoff notes.

## Frontend Guidance

- Match existing component boundaries before extracting abstractions.
- Prefer form-driven mutations that post to the API and then refresh or navigate to the relevant case surface.
- When adding a new screen, connect it to an existing workflow lane and navigation entry instead of creating an isolated demo page.
- When adding debug tooling in `apps/web`, use a shared `/debug` workspace as the main entry point. Add feature-specific tools there as modules or subroutes instead of creating a feature-specific top-level debug page.
- Keep empty, loading, and failed API states explicit.
- If a page consumes backend JSON, parse or type it through `@finance-ops/shared` whenever practical.

## Backend Guidance

- Reuse existing DTO parsing and Zod schemas instead of validating the same shape twice by hand.
- Audit whether a change affects:
  case detail,
  approval queue,
  finance-review queue,
  export behavior,
  question/clarification loops.
- When adding a new guarded endpoint, apply the correct role restrictions and ensure mock-auth development remains testable.
- Prefer additive response fields over destructive reshaping unless the task explicitly calls for a contract break.
- Add or update service/controller specs near the changed module when backend logic changes materially.

## Validation

Run the smallest set that proves the change.

For shared or broad changes:

```powershell
npm.cmd run build
```

For backend logic:

```powershell
npm.cmd run test --workspace @finance-ops/api
```

For frontend changes without dedicated tests:

- run the relevant page locally with `npm.cmd run dev:web`
- run the API with `npm.cmd run dev:api` if the page needs live data
- manually exercise the affected lane end to end

Always mention what you validated and what you could not validate.

## Manual Workflow Checks

Use these flows when the task affects business behavior:

- requester submit and clarification loop
- approval approve/reject/request-info loop
- finance review approve/reject/send-back loop
- export-ready to export or recoverable-exception path
- admin policy or routing configuration path

Read [references/repo-map.md](references/repo-map.md) for stable routes, commands, and current backend guarantees before making assumptions.
