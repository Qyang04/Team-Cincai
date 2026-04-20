# 5-Person Parallel Delivery Plan From The Current Codebase

## Summary
The current repo is a `real backend workflow skeleton + partially real / partially mock-heavy frontend shell`.

De-engineered status from the codebase:
- `apps/api` is already meaningful and stateful.
  It has real controllers, Prisma schema, workflow transitions, AI intake orchestration, policy routing, approval actions, finance review actions, export flow, audit logging, and mock adapter seams.
- `apps/web` is mixed.
  Some pages are data-bound to real API endpoints, but many screens still contain placeholder metrics, simulated analysis, static CTA buttons, hardcoded insight text, and presentation-only panels.
- `packages/shared` is still thin.
  It has workflow enums and a few shared types, but not enough stable view models/contracts for the whole product.
- The biggest execution risk is not “missing everything”; it is `frontend/backend mismatch + mock UI debt + thin shared contracts`.

To let 5 people work in parallel without waiting on each other, the split should follow `boundary ownership`, not page ownership alone. The least blocking setup is:
1. shared contracts and API response shaping
2. workflow backend core
3. intake + case detail frontend
4. approval + finance review frontend
5. admin + UX cleanup / beginner-safe mock-to-real cleanup

This gives one beginner-safe lane and keeps write scopes mostly separate.

## De-Engineered Current State
### What is already real
- `cases.controller.ts` already exposes real endpoints for:
  - case create / submit
  - artifacts
  - questions
  - policy review
  - approvals
  - finance review
  - export
- `workflow-execution.service.ts` already executes real runtime steps:
  - artifact processing
  - AI intake
  - policy routing
  - export processing
- `schema.prisma` already persists:
  - case
  - artifact
  - extraction result
  - open question
  - policy result
  - approval task
  - finance review
  - export record
  - workflow transition
  - audit event
  - admin setting

### Where the frontend is still mock-heavy
- Landing page and dashboard are mostly static marketing/ops UI with hardcoded metrics and example activity.
- New case form has a real submit path, but still includes simulated extracted preview and fake manual-entry panels.
- Approvals page fetches live tasks, but still injects hardcoded AI reasoning copy and sidebar metrics.
- Finance review page is closer to real but still has placeholder recommendation copy.
- Admin page fetches real config and connector status, but still includes mock nav sections and fallback connector cards.
- Case detail is the strongest page today because it is mostly bound to real case data.

### Main integration gaps
- Shared response types are duplicated in pages instead of being consumed from `packages/shared`.
- UI state names and workflow stages are visible, but not yet formalized as reusable view models.
- Approval, finance review, and admin screens still mix real fetches with non-real supporting panels.
- There is not yet a clean “operator-ready” dashboard backed by the API.

## Delegation Plan
### Person 1 — Shared Contracts And API Shape Owner
Best for: strongest TypeScript/system thinker

Ownership:
- `packages/shared/src/**`
- API response contracts that affect multiple UI surfaces
- no visual frontend ownership
- no workflow logic ownership

Tasks:
- expand shared types from raw workflow enums into reusable UI-facing contracts
- define canonical types for:
  - case summary
  - case detail
  - policy result
  - approval task
  - finance review item
  - export record
  - audit timeline item
- remove duplicated page-local response typing where possible by defining shared contracts first
- document current field gaps between API and UI
- identify which values are real, nullable, or currently mock-only

Deliverables:
- one shared contract layer that the other 4 people can code against
- a contract note listing exact payload expectations per page

Why this is low-blocking:
- mostly isolated to `packages/shared`
- other people can keep working against temporary assumptions, then align to these contracts later
- does not require waiting on UI polish or DB changes first

### Person 2 — Backend Workflow Core Owner
Best for: strongest backend/NestJS person

Ownership:
- `apps/api/src/modules/**`
- Prisma-backed workflow behavior
- no frontend page work
- coordinate only lightly with Person 1

Tasks:
- harden the current runtime behavior so the API becomes trustworthy for the UI team
- focus on:
  - case submission flow correctness
  - question answering transitions
  - policy routing
  - approval action flow
  - finance review action flow
  - export and recoverable exception flow
- remove hardcoded routing assumptions where feasible without widening scope too much
- make case detail endpoint the canonical source for downstream surfaces
- verify API returns enough data for:
  - intake confirmation
  - case detail
  - approval queue
  - finance review queue
  - admin settings

Deliverables:
- stable API behavior for the existing workflow skeleton
- real end-to-end happy path from submit to close using the current mocked integrations

Why this is low-blocking:
- this lane is backend-only
- frontend workers can use the current routes immediately
- no need to wait on dashboard/admin polish

### Person 3 — Intake + Case Detail Frontend Owner
Best for: solid frontend person comfortable with forms and data binding

Ownership:
- `apps/web/app/cases/new/**`
- `apps/web/app/cases/[id]/**`
- related shared UI patterns only if local to these pages
- do not edit approvals / finance review / admin pages

Tasks:
- convert the intake surface from “demo form with simulated side panels” into a clean product workflow
- keep the real submission path
- remove or replace clearly fake extracted-preview sections unless they can be backed by real data
- improve success/error states after submission
- make case detail the strongest real page in the app:
  - extraction panel
  - open questions
  - artifacts
  - policy result
  - downstream resolution summary
  - audit timeline
- ensure this lane works against the real backend, not placeholder copy

Deliverables:
- one reliable requester-facing flow:
  `new case -> submit -> open detail -> answer questions -> watch state progress`

Why this is low-blocking:
- page scope is cleanly isolated
- depends mainly on existing API routes that already exist
- does not need approvals/admin/dashboard to be done first

### Person 4 — Approval + Finance Review Frontend Owner
Best for: frontend person comfortable with operational workflows

Ownership:
- `apps/web/app/approvals/**`
- `apps/web/app/finance-review/**`
- no ownership of intake or admin
- can reuse shared UI atoms only if needed locally

Tasks:
- convert both queues from semi-real showcase screens into operator-ready review surfaces
- approval page:
  - keep real pending-task fetch
  - remove hardcoded reasoning blocks and fake sidebar metrics unless they become API-backed
  - improve approve / reject / request-info flow
- finance review page:
  - keep real queue fetch
  - improve approve / reject / send-back flow
  - make review reason and note handling clearer
- align both pages to the actual lifecycle and states from backend
- make empty / loading / action-complete states clean and consistent

Deliverables:
- one real approver lane
- one real finance-review lane
- no hard dependency on dashboard, admin, or landing page

Why this is low-blocking:
- page ownership is clean
- backend endpoints already exist
- only light coordination needed with Person 1 for contracts

### Person 5 — Beginner-Safe Admin + Mock UI Cleanup Owner
Best for: newbie teammate

Ownership:
- `apps/web/app/admin/policies/**`
- `apps/web/app/page.tsx`
- `apps/web/app/dashboard/page.tsx`
- safe UI cleanup only
- no backend ownership
- no shared-contract ownership

Tasks:
- make admin page more honest and less mock-looking:
  - keep real policy/routing fetch and form save behavior
  - remove obviously fake fallback integration cards if not needed
  - simplify static navigation labels into current-scope admin sections
- clean landing page and dashboard:
  - replace hardcoded “fake product metrics” with either:
    - clearly labeled demo placeholders, or
    - simple live summaries if already available from API
  - remove buttons that imply functionality not wired yet
  - focus on readability, consistency, and truthful UI
- help standardize labels, statuses, empty states, and section headings across pages

Beginner-safe rules:
- do not touch backend files
- do not touch Prisma schema
- do not refactor shared contracts
- stay inside the owned page files and CSS only
- prefer deleting fake panels over inventing new logic

Deliverables:
- cleaner landing/dashboard/admin surfaces
- less mock confusion across the demo
- a useful contribution that does not block anyone else

Why this is low-blocking:
- isolated page ownership
- mostly UI/content cleanup
- minimal dependency on other engineers

## Parallel Execution Rules
To avoid blocking, the team should work with these rules:

### Contract rule
- Person 1 publishes a short contract note first:
  - case detail shape
  - approval task shape
  - finance review item shape
  - admin config shape
- Other people may start immediately using current API shape, but should not redesign contracts independently.

### Ownership rule
- No overlapping ownership of the same route folder.
- No one except Person 2 edits `apps/api/src/modules/**`.
- No one except Person 1 edits `packages/shared/src/**`.
- Person 5 stays out of backend and shared packages entirely.

### Dependency rule
- Person 3 and Person 4 should consume existing endpoints first, not wait for “perfect backend”.
- Person 2 should prioritize keeping existing endpoints stable rather than introducing broad API churn.
- Dashboard and landing work should be treated as lowest dependency and lowest risk.

## Recommended Work Order
### Day 1
- Person 1: publish shared contract sketch
- Person 2: validate workflow happy path and queue flows
- Person 3: harden intake + case detail
- Person 4: harden approvals + finance review
- Person 5: clean admin + remove clearly fake landing/dashboard UI

### Day 2
- Person 1: align types with real payloads used by pages
- Person 2: close backend gaps discovered by UI people
- Person 3: finish requester flow and clarification handling
- Person 4: finish approval and finance-review action UX
- Person 5: standardize UI labels, empty states, and visual consistency

### Day 3
- All merge toward one demo-ready flow:
  - requester submits case
  - AI/question flow visible
  - policy routes
  - approver or finance reviewer resolves
  - export path or exception path visible

## Test Plan
Each person should verify only their owned surface first, then one shared end-to-end run as a team.

Required team scenarios:
- submit expense claim and reach case detail successfully
- missing project code triggers clarification and can be answered
- policy routes case to approval
- approver can approve, reject, and request info
- finance review can approve, reject, and send back
- export-ready case can export or move to recoverable exception
- admin page reads and saves policy/routing settings
- landing/dashboard/admin no longer mislead users with obviously fake UI

## Assumptions
- Team size is exactly 5.
- One teammate is newer and should stay in a beginner-safe frontend lane.
- Goal is maximum parallel progress with minimal waiting, not ideal long-term architecture refinement.
- Current repo already has enough backend skeleton to support UI hardening in parallel.
- The cleanest split is by subsystem boundary, not by arbitrary file count.
