# Repository Guidelines

## Project Structure & Module Organization
This repository is a TypeScript monorepo for `SME Finance Ops Copilot`.

- `apps/web`: Next.js frontend for requester, approver, finance-review, and admin flows.
- `apps/api`: NestJS backend for workflow orchestration, AI integration, policy checks, approvals, and exports.
- `packages/shared`: shared domain types, Zod schemas, workflow enums, and cross-app contracts.
- `docker-compose.yml`: local PostgreSQL and Redis services.
- Root docs such as `implementation-plan.md` describe intended architecture and roadmap.

Keep new domain contracts in `packages/shared` first, then consume them from `apps/web` and `apps/api`.

## Build, Test, and Development Commands
- `npm.cmd install`: install workspace dependencies.
- `docker compose up -d`: start local Postgres and Redis.
- `npm.cmd run dev:api`: run the NestJS API in watch mode.
- `npm.cmd run dev:web`: run the Next.js app locally.
- `npm.cmd run build`: build all workspaces.
- `npm.cmd run lint`: run workspace lint scripts when present.
- `npm.cmd run test`: run workspace test scripts when present.
- `npx prisma db push --schema apps/api/prisma/schema.prisma`: apply the current schema locally.

## Coding Style & Naming Conventions
Use TypeScript throughout. Prefer 2-space indentation, semicolons, and explicit types on public service/controller APIs. Use:

- `PascalCase` for classes and React components
- `camelCase` for variables and functions
- `SCREAMING_SNAKE_CASE` for workflow/status constants only when already established

Keep controllers thin; put business logic in services. Add shared types in `packages/shared/src`.

## Testing Guidelines
There is no full automated suite yet, so every change should at minimum:

- build cleanly with `npm.cmd run build`
- preserve API startup and key UI routes
- cover the affected workflow manually

When adding tests, place them near the owning app/module and name them `*.spec.ts` or `*.test.ts`.

## Commit & Pull Request Guidelines
Git history is minimal, so use Conventional Commit style going forward:

- `feat: add approval routing worker`
- `fix: correct export exception transition`

PRs should include:
- a short summary
- affected areas (`web`, `api`, `shared`, schema)
- setup or env changes
- screenshots for UI changes
- manual test steps and results

## Security & Configuration Tips
Do not commit real secrets. Keep `.env` local and start with `.env.example`. Default development uses mock auth/storage/AI flags; switch integrations on only when the required Supabase, Z.AI, and database settings are ready.
