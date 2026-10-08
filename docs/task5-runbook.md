# Task 5 setup, verification and handoff

## Fresh checkout

Install Node 24, npm and a MongoDB replica set (local MongoDB 7+ or Atlas). In `server`, run `npm ci`, copy `.env.example` to `.env`, set DATABASE_URL to a separate local `hotel_lobby_task12_demo` database, then `npm run db:generate`. Set MONGOD_PATH if mongod is not on PATH. Run `npm run db:local`, then `npm run db:push` only after confirming the demo database name. Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD (12+ characters); `npm run db:seed:demo` creates an idempotent demo admin, room type and room. `npm start` listens on PORT (default 3000). Verify `/health` and `/ready`.

The root PowerShell launcher files created during this user's setup reference a machine-specific portable runtime. They are local conveniences, not portable installation requirements. The commands above are the portable setup path.

For this configured Windows machine, run `powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -Background` from the repository root. It detects an already-ready backend, otherwise starts a hidden process, checks `/ready`, and writes logs/PID under ignored `server/.local-mongo`. The foreground form prints the listening port and must remain open. Neither form regenerates Prisma Client while an engine DLL may be locked. After schema/dependency changes, stop the backend before running `npm run db:generate`. These local launchers are intentionally ignored by Git.

Dependency remediation: keep Prisma 6.19.3, use deepmerge-ts 8.0.2 via override, upgrade Jest to 30.5.2, and override only Istanbul's config loader to js-yaml 4.3.2 (its used `load` API remains available). Client source-map-js is locked at 1.2.2. The complete existing suite passed after these changes. CI now requires zero moderate-or-higher advisories in both server/client, schema generation/validation, all backend tests and client lint/build.

Client: `cd client`, `npm ci`, `npm run dev`. UI is still a Vite starter; no claim of completed UI integration. Configure both origin allowlists for the actual consumer, including `http://127.0.0.1:5173` if used.

## Tests and demo

In server: `npm run lint` (JavaScript syntax checks, not a full style linter), `npx prisma validate`, `npm run test:task5`, `npm run test:all:isolated`. Test runner starts temporary replica sets and pushes schema only into explicitly guarded test databases. Set MONGOD_PATH and matching MONGOMS_VERSION to reuse an installed binary. Task 5 uses `hotel_lobby_task5_test`; never point tests at hotel_lobby or production.

Import `hotel-lobby.postman_collection.json`. Set baseUrl, email and password in a private local environment. Login saves token; create room type/room/guest saves IDs. Run availability, booking, receipt, check-in, check-out, dashboard/report, public availability and logout in order. Dates are generated in Bangkok time. Receipt is a **demo fixture only**; real operations must use actual payment evidence. Public availability remains callable after logout.

## Production deployment and rollback

Use an environment with Node 24 and MongoDB replica set connectivity. Install locked dependencies, generate Prisma Client, validate schema, and run the isolated suite before release. Supply DATABASE_URL via secret storage, exact CORS_ORIGINS/PUBLIC_CORS_ORIGINS and PORT. Place behind HTTPS; enforce TLS/HSTS, request limits and per-client rate limiting at the trusted reverse proxy. Do not enable Express trust proxy indiscriminately. The app does not use cookies. Use `/ready` for traffic readiness and `/health` for liveness, and allow at least 10s for shutdown.

No schema change is required by Task 5. Never run schema push/seed/backfill against existing data as part of automatic deployment. For existing databases stop writes, inventory counts/indexes/references, back up and restore to a disposable clone, follow `implementation-audit.md`, `api-task3.md` claims audit and `payment-reconciliation.md`, verify rollback and only then apply separately approved migration steps. Rollback Task 5 by deploying the previous application revision; preserve real ledger/history and restore backups only under the data recovery plan.

Deployment is not performed by this task without a target environment. CI configuration is supplied but must run on the actual remote repository. A reviewer must inspect the PR before merge; no review is fabricated.

## UI handoff and 8–10 minute demo

Use contracts Task 1–2/3/4/5 and Postman. UI must implement token expiry/logout, roles, loading/empty/error/conflict states and responsive layouts. Connect the full flow, verify real deployed origins, then publish UI/backend URLs. Suggested demo: login and roles (1 min), room/guest and availability (2), booking/payment/check-in/out (3), dashboard/public external HTTP call (1), tests/security and limitations (1–2). Keep a local seed database and Postman flow as backup. Frontend deploy, slides and team reviewer remain team handoff work; backend tests do not establish completed MVP.
