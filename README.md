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

## Backend Runtime Notes
- `apps/api/README.md`: current backend handoff, known-safe endpoints, mock-auth headers, and demo verification scenarios

## Next Steps
1. Install dependencies with `npm.cmd install`
2. Start local services with `docker compose up -d`
3. Implement real auth/storage and queue wiring
4. Replace mock connectors with production integrations over time

## Run The Web App
1. Start the API if you want the web app to load live data. The web app uses `http://localhost:4000/api` by default:

```powershell
npm.cmd run dev:api
```

2. In a separate terminal, start the Next.js app:

```powershell
npm.cmd run dev:web
```

4. Open `http://localhost:3000` in your browser.

If your API is running on a different host or port, set `NEXT_PUBLIC_API_BASE_URL` before starting the web app.

```powershell
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:4000/api"
npm.cmd run dev:web
```
