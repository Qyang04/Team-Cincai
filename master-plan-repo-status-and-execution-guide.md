# SME Finance Ops Copilot

## Repo Status And Execution Guide

This document is a companion to [`master-plan.md`](./master-plan.md). Its purpose is to make execution clearer by:

- stating the `current repo status` for every phase
- separating `implemented`, `partial`, and `missing` work
- translating each phase into concrete implementation tasks
- breaking work down by `shared`, `schema`, `api`, `web`, `admin`, `integrations`, and `verification`

This guide reflects the current repository state as inspected from the codebase on `2026-04-23`.

---

## 1. Executive Status Snapshot

### Overall maturity

The repo already has a strong `workflow backbone`, but it does not yet satisfy the full finance depth described in the master plan.

### What is already working well

- canonical workflow states exist and are enforced
- end-to-end flow exists for draft -> intake -> clarification or policy -> approval or finance review -> export or recoverable exception
- case detail is the strongest product surface and exposes extraction, questions, policy, approvals, finance review, export, timeline, and audit
- approval queue and finance review queue are functional
- export lifecycle and recoverable export failure path exist
- mock-first seams exist for auth, AI, storage, notifications, queue mode, and export
- tests pass and workspace build passes

### What is only partial

- Harness-style runtime metadata is partially represented, but not yet formalized as explicit stage metadata
- admin configuration exists, but only for a small subset of policy and routing behavior
- multi-workflow support exists structurally, but the flagship workflow is still much more real than the others
- Z.AI integration seam exists, but most current behavior is still mock-first

### What is still missing or thin

- multi-tier approval matrix depth
- FX reconciliation behavior
- tax extraction and arithmetic validation
- richer duplicate and fraud detection
- real artifact-driven extraction
- real sign-in and session shell
- filtering, assignment, and richer operational inbox behavior
- reporting and analytics
- stronger production readiness and observability

### Phase headline status

| Phase | Title | Current Status | Summary |
| --- | --- | --- | --- |
| 0 | Master spec and alignment | `Done` | The master plan exists and core terminology is mostly aligned. |
| 1 | Stabilize current prototype | `Mostly done` | Core runtime, tests, queues, detail surfaces, and recovery loops work. |
| 2 | Formalize Harness runtime metadata | `Partially done` | Some derived stage metadata exists, but explicit stage contracts are not yet formalized. |
| 3 | Deepen finance correctness | `Mostly not done` | Shared contracts anticipate this, but persistence and behavior are still thin. |
| 4 | Polish flagship demo slice | `Partially done` | Expense-claim style demo path exists, but not with full finance depth. |
| 5 | Broaden workflow nuance | `Mostly not done` | Shared engine supports multiple workflows, but their distinct business nuance is still shallow. |
| 6 | Production roadmap | `Not started beyond seams` | Adapters and flags exist, but real production-grade runtime concerns remain mostly future work. |

---

## 2. Current Repo Truth By Capability

### Case lifecycle and orchestration

Status: `Strong`

Already present:

- canonical workflow enum and transition rules in shared
- workflow transition enforcement in backend
- orchestrated submission flow
- policy routing job
- export job
- recoverable exception re-entry

Still needed:

- explicit stage metadata registry
- stage entry and exit contracts as first-class runtime concepts
- standardized owner metadata when manual action is required
- richer failure categories

### AI intake and extraction

Status: `Basic prototype only`

Already present:

- mock extraction result shape
- mock clarification generation
- mock routing recommendation
- optional Z.AI provider path

Still needed:

- evidence-aware extraction from uploaded artifacts
- broader field extraction coverage
- confidence and provenance per field with stronger semantics
- invalid AI output handling beyond basic failure behavior
- workflow-specific prompting and extraction rules

### Policy and routing

Status: `Moderate MVP`

Already present:

- project code requirement by workflow
- amount threshold routing
- vendor invoice number warning
- simple duplicate filename signals
- admin-managed threshold and basic routing defaults

Still needed:

- reconciliation flags
- approval requirement output
- workflow-specific policy packs
- richer duplicate and anomaly reasoning
- tax and arithmetic control checks
- clearer policy rationale payloads

### Approvals

Status: `Single-step only`

Already present:

- pending approval queue
- approve, reject, request-info loop
- task reopen after requester answer
- routing-configured default approver

Still needed:

- approval matrix persistence
- sequential approvals
- parallel approvals
- conditional tiers by amount, department, workflow, or cost center
- delegation and out-of-office behavior
- approval visibility at matrix level, not only task level

### Finance review

Status: `Functional MVP`

Already present:

- finance review queue
- approve, reject, send-back actions
- finance review routing from policy
- send-back clarification loop

Still needed:

- richer reason categories
- finance coding decisions
- reconciliation-specific resolution fields
- finance-specific case annotations
- queue assignment and work ownership

### Export and audit

Status: `Good prototype`

Already present:

- export-ready creation
- export processing
- recoverable export failure
- audit trail and workflow transitions
- export status visibility in UI

Still needed:

- normalized accounting payload spec
- workflow-specific export payload rules
- retry metadata
- export handoff history
- operational analytics and reporting

### Admin and configuration

Status: `Narrow but real`

Already present:

- policy settings
- routing settings
- connector status surface

Still needed:

- approval matrix configuration
- workflow-specific policy editing
- FX and tax policy config
- connector credentials and readiness workflow
- safer admin change history and audit

### Auth and RBAC

Status: `Mock-first only`

Already present:

- request user resolution
- role guard
- mock auth headers
- optional Supabase JWT verification path

Still needed:

- real sign-in shell
- session surface
- role-aware frontend session handling
- org and manager mapping
- approval identity resolution beyond hardcoded IDs

---

## 3. Phase-By-Phase Status And Detailed Plan

## Phase 0: Master Spec And Alignment

### Objective

Make the master plan the canonical build spec and align terminology, entities, states, and ownership across the repo.

### Current status

Status: `Done, but should be sharpened`

What is already done:

- `master-plan.md` exists and is comprehensive
- shared workflow enums and states reflect the plan
- repo structure follows the modular monolith direction

What still needs updating:

- the master plan should distinguish `current reality` from `future target`
- the plan should explicitly mark which sections are `implemented`, `partial`, or `planned`
- the plan should expose a practical next-work backlog

### Work needed to fully complete and harden this phase

#### Documentation

- add a `Current Repo Status` section to the main plan
- link plan items to actual repo modules
- mark sections as `MVP implemented`, `MVP partial`, `future`
- keep this guide and the master plan consistent

#### Shared

- keep the shared contracts as the source of truth for enums, workflow types, and state transitions
- document which contract fields are `live` versus `reserved for later phases`

#### Verification

- verify every documented state exists in code
- verify every documented workflow type exists in shared, API, and intake UI

### Definition of done

- plan terminology matches code
- future work is clearly separated from current implementation
- the team can tell what is real today without reading the entire codebase

---

## Phase 1: Stabilize Current Prototype

### Objective

Make the current prototype reliable enough for iterative feature work and demo usage.

### Current status

Status: `Mostly done`

Already done:

- tests pass
- build passes
- workflow transitions are enforced
- approval request-info loop works
- finance send-back loop works
- case detail API is stable and strong
- export failure transitions to recoverable exception

Remaining hardening work:

- clean up doc drift between plan and runtime truth
- tighten lint and consistency checks
- verify all guarded frontend routes always use correct role context
- add more explicit manual test scripts for demo reset and seed expectations

### Detailed implementation plan

#### Shared

- confirm all current API response shapes are locked in schemas
- ensure action envelopes stay consistent across approval, finance review, export, and recover
- document which fields are nullable and why

#### Schema

- confirm current Prisma models match live UI/API usage
- audit nullable fields versus actual runtime assumptions
- add indexes later only if query pressure appears

#### API

- preserve stale transition protection
- preserve queue and orchestrator reliability
- keep recovery and re-entry flows explicit
- tighten error messages on not-found and invalid-state actions

#### Web

- keep dashboard, approvals, finance review, and case detail consistent with current API truth
- avoid invented data that is not backed by live endpoints
- make route fallbacks and error notices consistent

#### Verification

- keep workspace build green
- keep API tests green
- add manual verification checklist for:
- requester clarification loop
- approver request-info loop
- finance send-back loop
- export failure and recover flow

### Definition of done

- prototype behavior is stable for repeated demo use
- build and tests stay green
- no drift between documented workflow and actual behavior

---

## Phase 2: Formalize Harness Runtime Metadata

### Objective

Represent the runtime in explicit Harness-style terms instead of relying only on service behavior and derived UI summaries.

### Current status

Status: `Partially done`

Already done:

- stage is exposed through case status
- `manualActionRequired` is derived
- `failureMode` is derived
- `exportReadinessSummary` is derived

Not yet done:

- explicit stage registry
- stage metadata per runtime step
- entry condition and output contract model
- owner metadata when manual action is required
- stage-specific retry metadata

### Detailed implementation plan

#### Shared

- define a `StageDefinition` contract for:
- stage name
- entry condition
- success transition
- failure transition
- manual owner
- audit requirements

- define shared view models for:
- current stage metadata
- current manual owner
- failure category
- retryability

#### Schema

- decide whether stage metadata is persisted or fully derived
- if persisted, add fields for:
- current failure category
- last stage executor
- manual owner
- last retryable error

#### API

- add a centralized runtime/stage definition map
- stop scattering stage semantics across multiple services
- expose explicit stage metadata in case detail
- add consistent failure classification

#### Web

- show stage metadata clearly in case detail
- separate `current stage` from `overall case status` if needed
- expose “who needs to act next” more explicitly

#### Verification

- each stage should have:
- an entry rule test
- a success path test
- a failure path test
- a manual-owner expectation

### Definition of done

- stage semantics are formalized, not implied
- case detail exposes real runtime metadata, not only derived summaries
- future workflows can plug into the stage model cleanly

---

## Phase 3: Deepen Finance Correctness

### Objective

Move from a workflow prototype into a finance-credible control plane.

### Current status

Status: `Mostly not done`

Already done:

- shared contracts already anticipate FX, tax, reconciliation, and approval-requirement fields
- finance review lane exists structurally
- simple policy and duplicate signals exist

Not yet done:

- persistence for reconciliation and approval-requirement outputs
- FX logic
- tax logic
- arithmetic validation
- meaningful duplicate and fraud reasoning
- finance control UI depth

### Detailed implementation plan

#### Section A: Approval matrix depth

What needs to be implemented:

- persist approval matrix definition per case
- support one case having multiple approval tasks
- support matrix patterns:
- single approver
- sequential chain
- parallel approvals
- conditional extra tier
- finance coding review after business approvals

Needed in `packages/shared`:

- approval matrix contracts
- approval stage summary contract
- approval dependency state
- delegation and substitute approver fields

Needed in `schema.prisma`:

- `ApprovalMatrix` model
- richer `ApprovalTask` with:
- step number
- group key
- dependency type
- delegatedFrom
- actingApproverId

Needed in `apps/api`:

- approval matrix builder from policy outcome
- logic for opening the correct next tasks
- logic for parallel completion
- logic for blocking export until all required approvals finish
- rejection propagation across the full matrix

Needed in `apps/web`:

- matrix visibility in case detail
- progress view for current approval stage
- clearer view of who already approved and who is still pending

Verification needed:

- sequential two-step approval
- parallel all-required approval
- delegated approver path
- rejection at intermediate step blocks export

#### Section B: FX reconciliation

What needs to be implemented:

- capture:
- original amount
- original currency
- base currency
- estimated FX rate
- estimated base amount
- realized base amount
- realized FX source

- create policy for:
- when estimate is enough
- when statement proof is required
- when mismatch triggers requester clarification
- when mismatch triggers finance review

Needed in `packages/shared`:

- finalize live semantics for FX fields
- define reconciliation flags and reasons

Needed in `schema.prisma`:

- ensure extraction result can carry FX fields cleanly
- persist policy reconciliation flags
- optionally add finance resolution fields for settled amount evidence

Needed in `apps/api`:

- derive estimated FX from intake or policy layer
- compare realized amount when provided
- create clarification questions for missing realized values
- route mismatches to finance review

Needed in `apps/web`:

- FX section in case detail
- input surface for requester or finance to supply settled amount evidence
- visible discrepancy flags

Verification needed:

- estimate-only happy path
- realized amount override path
- material mismatch path
- finance escalation path

#### Section C: Tax segregation and accounting normalization

What needs to be implemented:

- extract:
- net amount
- tax amount
- gross amount
- vendor tax ID

- validate:
- `net + tax = gross`
- tax-sensitive workflows such as vendor invoice

Needed in `packages/shared`:

- finalize semantics for tax fields
- define tax mismatch flags

Needed in `schema.prisma`:

- persist tax-related policy flags and failure categories

Needed in `apps/api`:

- tax arithmetic validator
- policy routing for tax mismatch
- exception creation when arithmetic is invalid

Needed in `apps/web`:

- tax block in extraction panel
- mismatch display in policy panel
- finance resolution notes around tax corrections

Verification needed:

- valid tax arithmetic path
- invalid arithmetic clarification path
- vendor invoice finance escalation path

#### Section D: Duplicate and fraud detection

What needs to be implemented:

- move beyond filename duplication
- add reasoning from:
- repeated invoice numbers
- repeated amounts plus close dates
- repeated merchant plus amount patterns
- suspicious resubmission indicators
- conflicting submissions

Needed in `packages/shared`:

- duplicate signal and fraud signal structures
- short rationale summary contract

Needed in `schema.prisma`:

- persist richer duplicate and anomaly findings

Needed in `apps/api`:

- duplicate detection service
- cross-case lookup logic
- policy integration for routing and warning severity

Needed in `apps/web`:

- dedicated duplicate/fraud subsection in case detail
- signal severity, rationale, and recommended next action

Verification needed:

- exact duplicate route
- near duplicate warning route
- suspicious case finance route

### Definition of done

- finance controls affect routing and export readiness in real ways
- case detail visibly shows reconciliation, tax, and duplicate decisions
- shared contracts and database persistence match actual finance behavior

---

## Phase 4: Polish Flagship Demo Slice

### Objective

Make one expense-claim scenario polished, explainable, and demo-strong from intake to export.

### Current status

Status: `Partially done`

Already done:

- intake form exists
- clarification loop exists
- approval flow exists
- finance review flow exists
- export flow exists
- audit and timeline are visible

Still needed for a polished flagship:

- richer extraction from artifacts
- more realistic explanation quality
- stronger finance correctness
- predictable seeded demo cases
- cleaner role-based walkthrough experience

### Detailed implementation plan

#### Demo scenario design

Implement at least one canonical flagship story:

- expense claim with receipt and parking artifact
- missing project code triggers clarification
- amount threshold triggers approval or finance review based on configured amount
- approval decision is visible
- export payload becomes visible
- timeline clearly shows every gate and decision

Optional second demo path:

- duplicate suspicion or FX mismatch path

#### Needed in `apps/web`

- smoother walkthrough copy on new case, dashboard, approval queue, finance queue, and case detail
- stronger empty states and success states
- visible “what to do next” on each role surface
- role switch or demo-role explanation surface if real auth is still absent

#### Needed in `apps/api`

- seedable demo cases
- predictable demo reset path
- deterministic trigger cases for:
- clarification
- approval
- finance review
- export failure

#### Needed in documentation

- one clear demo script
- role-by-role walkthrough
- known trigger notes

#### Verification

- dry-run the complete demo from start to finish
- verify every screen has a clear narrative
- verify no misleading static copy contradicts live behavior

### Definition of done

- a judge or teammate can run the flagship scenario without guessing what to click next
- the core value proposition is visible in one coherent flow

---

## Phase 5: Broaden Workflow Nuance

### Objective

Make the other workflows meaningfully different on the same engine instead of only sharing labels.

### Current status

Status: `Mostly not done`

Already done:

- four workflows exist as selectable types
- shared engine supports all four structurally

Still needed:

- workflow-specific extraction logic
- workflow-specific policy logic
- workflow-specific required fields
- workflow-specific approval and finance review behavior

### Detailed implementation plan

#### Expense claim

Needed:

- stronger receipt-centered extraction
- project code and purpose discipline
- duplicate claim sensitivity

#### Petty cash reimbursement

Needed:

- lighter evidence expectations
- simpler approval defaults
- reduced finance escalation unless anomalies appear

#### Vendor invoice approval

Needed:

- invoice-number importance
- tax extraction and validation
- vendor-focused duplicate detection
- finance coding review logic

#### Internal payment request

Needed:

- cost center requirement
- project code requirement
- stronger routing and conditional approval tiers
- safer export readiness criteria

#### Shared and API work

- define workflow-specific rulesets
- make intake and policy engines workflow-aware
- avoid hardcoding all behavior into generic if-statements

#### Web work

- surface workflow-specific expectations in new case UI
- show workflow-specific fields and warnings in case detail

#### Verification

- one complete happy path per workflow
- one exception path across at least three workflows

### Definition of done

- each workflow feels intentionally modeled, not only renamed
- policy, extraction, and routing differ in meaningful, explainable ways

---

## Phase 6: Production Roadmap

### Objective

Turn the prototype architecture into a production-expandable finance operations platform.

### Current status

Status: `Not started beyond seams`

Already present:

- adapter seams
- optional Supabase JWT verification path
- optional Z.AI runtime path
- inline and BullMQ-ready queue modes

Still needed:

- real auth and org mapping
- real extraction pipeline
- real storage flow
- real notification connectors
- real export connectors
- stronger security, observability, reliability, tenancy, and operations

### Detailed implementation plan

#### Auth and RBAC hardening

- real sign-in UI
- session management
- org membership
- manager hierarchy and approver lookup
- admin scoping rules

#### Connector replacement

- real file upload flow
- real OCR and extraction provider
- real notification adapter
- real accounting export adapter
- connector secrets and health checks

#### Queue and reliability

- BullMQ as a real worker mode
- retry policies
- dead-letter handling
- job tracing
- idempotency strategy

#### Observability

- structured logs
- request IDs
- job IDs
- stage metrics
- error monitoring
- audit-safe redaction strategy

#### Security and governance

- secret management
- stricter authorization boundaries
- safer admin actions
- PII-safe logs
- immutable review attribution

#### Reporting and analytics

- operational dashboards
- SLA tracking
- export success/failure reporting
- approval cycle time analytics

#### Multi-tenant and platform growth

- tenant boundaries
- tenant-scoped policy config
- tenant-scoped routing
- connector isolation

### Definition of done

- the system can operate with real identity, real files, real connectors, and production-grade observability
- failures are visible, recoverable, and attributable

---

## 4. Clear Work Breakdown By Section

## A. Shared Contracts

### Already present

- workflow enums
- case statuses
- role types
- case detail contracts
- queue contracts
- admin config contracts
- placeholder finance fields

### Needed next

- explicit stage metadata contracts
- approval matrix contracts
- reconciliation flag contracts
- richer duplicate/fraud signal contracts
- normalized export payload contract
- live versus future field annotations in docs

---

## B. Database And Persistence

### Already present

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

### Needed next

- approval matrix persistence
- reconciliation flags persistence
- approval requirement persistence
- richer anomaly persistence
- better failure categorization persistence
- optional assignment and work-ownership persistence

---

## C. Backend API And Runtime

### Already present

- orchestrator
- workflow transitions
- policy routing
- approval task creation
- finance review enqueue
- export processing
- recoverable exception re-entry
- mock and optional live connector seams

### Needed next

- explicit Harness runtime map
- richer workflow-specific AI and policy logic
- approval matrix engine
- finance correctness engine
- duplicate and anomaly engine
- normalized export engine

---

## D. Frontend And Operator Experience

### Already present

- overview page
- dashboard
- new case
- case detail
- approval queue
- finance review queue
- admin policy page

### Needed next

- role-aware sign-in and session shell
- stronger inbox filtering and assignment
- richer matrix visualization
- richer finance-controls UI
- better demo-role switching or real auth
- operational analytics and reporting surfaces

---

## E. Integrations

### Already present

- Z.AI seam
- Supabase JWT seam
- mock storage seam
- mock notifications seam
- mock export seam
- BullMQ-ready queue seam

### Needed next

- real file and OCR pipeline
- real notifications
- real accounting export
- real org and user directory mapping
- integration audit and health workflows

---

## F. Testing And Readiness

### Already present

- API-focused local tests
- shared schema tests
- working build

### Needed next

- web tests
- integration tests across full workflow paths
- seeded demo verification
- matrix approval tests
- FX and tax tests
- duplicate detection tests
- connector failure and retry tests

---

## 5. What To Do Next In Practical Build Order

## Tier 1: Must do next

1. Add explicit current-status language into planning docs so the team stops confusing future target with current implementation.
2. Formalize Phase 2 runtime metadata so the system has a cleaner stage model.
3. Implement Phase 3 persistence gaps:
- reconciliation flags
- approval requirement
- richer failure categories
- approval matrix models
4. Implement approval matrix depth.
5. Implement first real finance correctness slice:
- FX discrepancy flow or tax mismatch flow

## Tier 2: Should do soon

1. Polish the flagship expense claim demo end to end.
2. Add seeded demo scenarios and reset flow.
3. Broaden vendor invoice nuance.
4. Add richer duplicate detection.
5. Improve case inbox filtering and assignment behavior.

## Tier 3: After that

1. Real sign-in shell and session handling.
2. Real connector replacement.
3. Reporting and analytics.
4. Multi-tenant and production hardening.

---

## 6. Suggested Working Method For The Team

For each major section, execute in this order:

1. `Shared contracts first`
Decide exact data shapes and semantics.

2. `Schema second`
Persist only what the runtime and UI truly need.

3. `API behavior third`
Implement orchestration and policy logic.

4. `Web surfaces fourth`
Expose only live behavior and truth-backed UI.

5. `Verification fifth`
Add tests and scripted manual demo checks.

---

## 7. Immediate Recommended Epic Breakdown

If the team wants a clean next sprint breakdown, use these epics:

### Epic 1: Runtime Metadata Formalization

- explicit stage model
- manual owner metadata
- failure category cleanup
- case detail metadata upgrade

### Epic 2: Approval Matrix Engine

- matrix contracts
- matrix persistence
- sequential and parallel logic
- matrix UI

### Epic 3: Finance Correctness Slice

- FX or tax path
- reconciliation flags
- finance review decisions
- export blocking rules

### Epic 4: Flagship Demo Polish

- seeded data
- walkthrough copy
- deterministic triggers
- role-path clarity

### Epic 5: Workflow Nuance Expansion

- vendor invoice rules
- internal payment controls
- petty cash simplification

---

## 8. Final Summary

The repo is not empty and it is not just scaffolding. It already has a credible workflow engine and usable operator surfaces. The biggest gap is not basic plumbing anymore. The biggest gap is `finance depth`.

The clearest path forward is:

1. formalize the runtime metadata
2. deepen approval matrix and finance correctness
3. polish one flagship demo path
4. broaden workflow nuance
5. harden toward production

That is the shortest route from the current prototype to a system that feels intentionally designed rather than merely connected.
