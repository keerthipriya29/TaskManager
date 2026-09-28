# QC Task Manager

QC Task Manager is a live operations dashboard for scheduling quality-control work, tracking task state, and surfacing reminders when scheduled work is due.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/qc-task-manager` — React/Vite dashboard at `/`
- `artifacts/api-server/src/routes/tasks.ts` — task CRUD, dashboard summary, and reminder routes
- `artifacts/api-server/src/lib/task-scheduler.ts` — background reminder scheduler and seed data
- `lib/db/src/schema/tasks.ts` — PostgreSQL task table definition
- `lib/api-spec/openapi.yaml` — source of truth for task API contracts
- `artifacts/qc-task-manager/src/index.css` — dashboard theme tokens and styling

## Architecture decisions

- Task dates are stored as calendar dates and schedule times as `HH:MM` strings so the scheduled day is not shifted by timestamp serialization.
- Reminder delivery uses a short-lived in-memory ID queue backed by the database task state; the scheduler runs every 15 seconds and the client polls for reminders.
- PostgreSQL and Drizzle are used for durable task data in the shared API service; the dashboard consumes generated OpenAPI React Query hooks.
- Task status is synchronized from schedule time: tasks within 24 hours are `Scheduled`, later work is `Upcoming`, and completed tasks remain `Completed`.

## Product

- Create, edit, reschedule, complete, snooze, and delete tasks.
- Review scheduled, upcoming, completed, and total task metrics.
- Filter and search the work queue.
- Receive live reminder checks with server health status and quick actions.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- Restart the managed API and web workflows after backend or frontend code changes.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
