# Task 5 acceptance — 9 October 2026

Local backend implementation verified. This is not production deployment, remote CI success, reviewer approval or completed frontend/MVP.

Environment: Windows, portable Node 24.21.0, Prisma 6.19.3, MongoDB 8.2.6 replica sets. The Codex Windows sandbox denied native realpath calls; test processes used an external workspace preload that substitutes Node's standard JavaScript realpath implementation. This is a tooling compatibility change only, not a repository/runtime dependency. MongoDB tests use freshly created temporary replica sets with explicitly guarded database names.

| Requirement | Current evidence | Status |
|---|---|---|
| Dashboard hotel-day counts | `task5.test.js`: Bangkok midnight boundary, fixture counts, shared availability | Passed |
| Admin aggregate report | Ledger receives/refunds totals; receptionist 403; no PII | Passed |
| Public availability | Same response as staff service, five-field allowlist, bad inputs, 429 Retry-After | Passed |
| Security and readiness | Headers, 64KiB body/4096 URL bounds, origin allowlist, auth/report roles, DB readiness/down/draining | Passed |
| Full backend flow | HTTP login, create room type/room/guest, availability, booking, receipt, check-in/out, dashboard, public, logout/revocation | Passed |
| Postman artifact | All 17 requests plus saved-variable/test scripts executed against a real TCP HTTP listener via test harness | Passed; Postman desktop itself not used |
| External HTTP consumer | `node scripts/smoke-public.js`: independent child process fetch, ready + 200, one demo room, public fields verified | Passed |
| Existing regression suite | `npm run test:all:isolated` exit 0: original 166 cases + final Task 5 seven cases = 173 | Passed |
| Final Task 5 suite | Seven cases including Postman artifact execution; final complete isolated runner exit 0 with all 173 cases | Passed |
| Syntax/schema | `npm run lint` and Prisma validate | Passed; lint is syntax validation |
| Git hygiene | `git ls-files '*node_modules*'` zero; only `.env.example` tracked; `git diff --check` | Passed |
| CI workflow | Backend install/generate/schema/lint/isolated tests configured | Supplied; remote run pending |
| Graceful shutdown | SIGINT/SIGTERM handler, readiness drain, Prisma disconnect, 10s deadline inspected | Implemented; deployment signal behavior pending |
| Deployment/data migration | No Task 5 schema change; runbook covers existing-data audit/backup/reconcile/rollback | Target/recovery rehearsal pending |
| UI, slides and reviewer | API contracts and demo flow handed off | Pending team integration/review |

The split Booking legacy runner selects disjoint test name groups across separate instances; intermediate skipped counts are selections, not omitted final cases. No tests were deleted or weakened to obtain a pass. Public API is intentionally anonymous; API-key 401 does not apply. Only local demo/test databases were used; no production data migration was performed.

Historical audit before remediation (resolved below): setup npm audit reported 36 server advisories (5 moderate/31 high) and one high client advisory. Dependency updates require separate compatibility assessment; no `audit fix --force` was applied. Public limits are in-memory per instance and proxy IP policy is documented. Existing availability loads matching inventory before response pagination; high-traffic readiness requires representative performance testing/shared edge limits. These limitations prevent claiming unrestricted production readiness.

Historical omit-dev audit before remediation (resolved below): npm audit --omit=dev reported three high advisories through Prisma/config/deepmerge-ts. Do not interpret the development-tool origin as zero production-install exposure. This is a documented release blocker for unrestricted production deployment pending compatible dependency remediation. OpenAPI Task 5 validated successfully with Swagger CLI.

## Remediation verification — 9 October 2026

Supersedes dependency follow-up above: Jest upgraded to 30.5.2, deepmerge-ts pinned by override to 8.0.2 while keeping Prisma 6.19.3, and the Istanbul config loader uses js-yaml 4.3.2 (same load API) to remove vulnerable argparse/sprintf-js. Client source-map-js updated to 1.2.2. Server and client npm audits now report zero vulnerabilities. Full isolated suite after dependency changes passed all 173 cases; client lint/build and backend syntax/Prisma validation passed. The original regression assertions remain intact.

Local `http://127.0.0.1:3000/ready` was checked with an independent PowerShell HTTP request and returned `{ "status": "ready" }`. Launcher avoids repeated Prisma generation and now supports `-Background` with PID/log files, readiness checks, existing-ready detection and explicit startup output. Machine-specific launchers are local conveniences and are not required by the portable README setup.

GitHub remote is Dataserial/Hotel-Lobby, default branch develop at ed9f3d3. No stored GitHub authentication was available to the tools during preparation; remote CI/reviewer approval must not be marked passed until an authenticated run and real review exist.

Fresh dependency verification: a source snapshot without node_modules or .env completed npm ci, Prisma generate/validate, zero-advisory audit and all seven Task 5 integration cases on fresh temporary replica sets. A tooling-only realpath preload was needed inside Codex Windows sandbox; it is not committed or required by GitHub Actions.
