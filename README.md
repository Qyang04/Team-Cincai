# SME Finance Ops Copilot

Greenfield implementation scaffold for a finance-operations workflow platform powered by Z.AI GLM.

## Stack
- Next.js web app
- NestJS API
- PostgreSQL + Prisma
- Redis + BullMQ
- Supabase Auth/Storage
- Z.AI GLM via backend gateway

## Workspace Layout
- `apps/web`: requester, approver, finance-review, and admin UI
- `apps/api`: workflow engine, AI orchestration, policy engine, approval flow
- `packages/shared`: shared domain types, schemas, and workflow constants

## Next Steps
1. Install dependencies with `npm.cmd install`
2. Start local services with `docker compose up -d`
3. Implement real auth/storage and queue wiring
4. Replace mock connectors with production integrations over time

