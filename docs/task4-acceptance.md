# Task 4 acceptance — 9 October 2026 (Asia/Bangkok)

Backend implementation complete: Payment remains a 1:1 summary, backed by immutable receipt/refund transactions. Receive/refund/check-in/out routes require active staff authentication. All mutations use transaction/state guards; payment, booking edit/cancel and stay operations serialize through Booking version writes. There is no cumulative-amount edit endpoint and no gateway.

## Verified results

Runtime checked locally: Node **v24.19.0**, npm **11.17.0**, Prisma **6.19.3**, installed MongoDB **7.0.8** on Windows. Tests use temporary single-node replica sets and explicit test database guards, never hotel_lobby.

| Check | Actual result |
|---|---|
| Prisma validate with a test DATABASE_URL | Passed |
| Prisma generate | Passed |
| Swagger CLI 4.0.4 validate docs/openapi-task4.yaml | Passed; 6 paths, 6 operations, including Task 3 Booking schema reference |
| git diff --check | Passed |
| npm run test:all:isolated | Exit 0; **166/166 distinct cases passed** |

| Test group | Passed cases | Evidence covered |
|---|---:|---|
| Existing validation/availability/booking | 21 | Original guards, snapshots, claims, raw legacy reads and concurrency |
| Task 1–2 HTTP | 5 | Auth, CRUD, permissions and demo seed repeatability |
| Task 3 | 57 | HTTP, service, claims/index audit, rollback and races |
| Payment ledger unit | 10 | Cumulative receipts after refunds, zero/cancel status, invalid amounts/dates |
| Task 4 reconciliation | 6 | Evidence totals, repeatability, real unique indexes, missing legacy fields, CLI no-write/target/index guards |
| Task 4 payment | 4 | Installments, mixed methods, refunds/source guards, replay, duplicate evidence and inconsistent summaries |
| Task 4 booking | 4 | Refund/cancel status, lower repricing/new receipts, legacy blocks and Prisma Int cumulative limit |
| Task 4 stay | 8 | Bangkok midnight, late entry, payment prerequisite, wrong/inactive/occupied rooms, conflicting occupants, original claims and zero price |
| Task 4 HTTP | 7 | Both roles, session actor, replay, field allowlists, error envelope, output privacy, transitions and CORS |
| Task 4 atomic | 44 | All write-boundary rollbacks, full transaction retries and deterministic concurrent operations |

The final runner executed Task 4's seven suites together: 83/83 cases, 58.849 seconds. Existing suites contributed 83/83 cases. Legacy booking tests intentionally run as 8+1+1 cases on separate replica sets; per-invocation filtered cases are reported by Jest as skipped, but all 10 distinct cases execute across the runner. No test cases were removed to obtain the result.

Rollback tests inject failure after booking/ledger/summary writes for receipt/refund, booking/summary/claim writes for cancellation, and booking/room writes for stay operations, then compare every affected collection with its prior snapshot. Retry tests abort real transactions twice and verify fresh actor/booking reads, a single final ledger row, and a three-attempt limit. Separate tests change actor and booking state before retry. Race tests synchronize snapshot reads and verify balances/claims/room occupancy afterward, including cross-booking key/reference uniqueness.

An initial regression attempt exposed a Windows test harness stall: synchronous Prisma schema subprocesses prevented the test process from draining mongod pipes. Task 3/4 and Task 1–2 setup now uses async spawn, and Task 1–2 skips redundant client generation. Its five original assertions/tests passed again, followed by the complete successful runner. An OpenAPI inline description also required YAML quoting; the corrected document passed full Swagger validation.

## Reproduce

From server, with dependencies installed and a local MongoDB binary available:

```powershell
$env:MONGOD_PATH='C:/Program Files/MongoDB/Server/7.0/bin/mongod.exe'
$env:MONGOMS_VERSION='7.0.8'
# validate/generate do not connect to this placeholder test URL
$env:DATABASE_URL='mongodb://127.0.0.1:27018/hotel_lobby_task4_test?replicaSet=task4set'
npx prisma validate
npx prisma generate
npm run test:all:isolated
npx --yes @apidevtools/swagger-cli@4.0.4 validate ../docs/openapi-task4.yaml
```

The runner/helper replaces DATABASE_URL with newly allocated localhost replica-set URLs before schema push/fixtures. Full runner includes all seven Task 4 suites. Test vouchers are explicitly synthetic; demo seed creates no financial records.

## Commit sequence and handoff

1. `987894a` — docs(task4): define payment and operation contracts
2. `d06c645` — feat(payment): add transaction ledger and reconciliation tooling
3. `4ffcae3` — feat(payment): record receipts and refunds atomically
4. `8cadec9` — fix(booking): preserve payment guards across concurrent operations
5. `d5c9f31` — feat(operations): add guarded check-in and check-out
6. `1f77f2a` — feat(api): expose payment and stay operation endpoints
7. `test(task4): prove rollback concurrency and acceptance` — final limits/legacy/CLI/atomic coverage, runner reliability and documentation

Each feature commit included its tests and had relevant checks before committing. The last commit extends these with aggregate acceptance and additional edge cases.

For UI: follow [contract](api-task4.md) and [OpenAPI](openapi-task4.yaml); send one stable Idempotency-Key per externally completed movement and retain it through transport retries. A new movement needs a new key and a real new voucher/reference. Display receipt/refund history, net/remaining and reconciliation errors. Refund first, then request cancellation separately. Check-in/out repeat calls conflict; load current booking state after a lost response. Do not send totals, status, actor or actual stay timestamps.

Existing live data/schema/indexes, verified live vouchers, backups/restoration and deployment were **not** operated on. Use the [reconciliation runbook](payment-reconciliation.md) before opening old data to writes. Frontend integration, reviewer/merge and deployment remain separate work. The replica-set tests verify transactional behavior but do not simulate production failover or guarantee that a staff-supplied reference corresponds to a real bank movement; staff verification is required by the recording workflow.
