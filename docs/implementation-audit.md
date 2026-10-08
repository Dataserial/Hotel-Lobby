# Implementation audit — 8 October 2026

Current Task 5 evidence is appended below (9 October 2026). Baseline and earlier task sections are historical records, not current claims that routes/auth are missing.

Scope: Task 1–2 only. The register below was made before feature edits by reading the tracked project files, checking the schema and services against the plan and PDF, and running the listed baseline commands. `ผ่าน` means the stated narrow check passed; it does not mean the complete MVP passed. `ยังรันไม่ได้` means runtime evidence is unavailable.

## Baseline and gaps

| Requirement | PDF / design | Schema / service / test / API / UI evidence | Result |
|---|---|---|---|
| Auth and roles | Admin and receptionist, hash, login/logout | `User` has role/hash; no auth HTTP route; UI starter | ไม่ผ่าน |
| Users | Admin manages users | `User` model only; `/users` returns placeholder text | ไม่ผ่าน |
| Room types | Admin writes, receptionist reads | `RoomType` model; no route; design has actor fields absent in schema | ไม่ผ่าน |
| Rooms | CRUD/search, preserve number | Schema maps `Room` and uses `number`; no route; legacy optional fields | ไม่ผ่าน |
| Guests | CRUD/search | `Guest` model; no route; document number is sensitive | ไม่ผ่าน |
| Booking overlap | Prevent double booking | Service uses transaction and unique `(roomId,night)` claims; unit tests pass, DB integration unavailable | ยังรันไม่ได้ |
| Frontend | Responsive hotel workflows | Vite starter; lint/build cannot start without install | ไม่ผ่าน |
| Seed | Repeatable example data | JSON has placeholder password hashes and extra audit/roomNumber fields; test helper transforms it destructively in a guarded test DB | ไม่ผ่าน |

PDF source `docs/แผนงาน/documentPLAN.pdf` has 11 pages. The newly supplied PDF described in `BACKEND_WORK_PLAN.md` reports Step 2–3 owner **Poohlikung** and Step 9 **poohlikung** as completed entries; the checked-in PDF does not supply the same owner cells. These are reported document states, not runtime acceptance. Team must confirm spelling and assign at least one reviewer before PR merge. Step 9 is outside this implementation except as an existing dependency.

## Baseline commands and actual results

| Command | Result |
|---|---|
| `node --version`; `npm --version` | v26.10.0; 11.19.1 — ผ่าน |
| `npm run db:generate` (server) | Prisma Client 6.19.3 generated — ผ่าน |
| `npx prisma validate` without `DATABASE_URL` | P1012 missing env — ไม่ผ่าน; rerun with guarded test URL before acceptance |
| `npm test -- --runTestsByPath tests/booking-validation.test.js` | 8/8 tests pass — ผ่าน |
| `npm run lint`; `npm run build` (client) | `eslint` / `tsc` executables missing — ยังรันไม่ได้; frontend setup issue |
| `where mongod`, `where mongosh`; port 27018 | not found, no listener — ยังรันไม่ได้; no DB inspection or integration proof |
| `git ls-files` | 6,859 tracked files, about 6,799 in `node_modules` — hygiene failure |

## Data and migration gate

Target production URL and DB contents are **unknown**; no production `db push`, seed, or backfill has been run. The schema currently preserves `Room.number` and `@@map("Room")`; `status`, `active`, `floor`, `roomTypeId`, and timestamps are optional to read legacy rooms. A legacy room without a valid active type/status/active flag cannot be booked. `RoomNightClaim` has the unique room/night index in the schema, but the live index has not been inspected. `Payment` is a one row summary, not a transaction ledger.

Before touching an existing DB: confirm the exact URL/database; read collection names, counts, a redacted sample, and indexes; take a backup (`mongodump`); detect duplicate room numbers, type references, guest references, claim collisions, and orphan claims; run an idempotent backfill on a copied DB; verify counts and bookings; then apply to the target with rollback by restore. Never run tests against `hotel_lobby`. The sample JSON is a design fixture; do not run it as a production seed.

## Priority and ownership

1. Task 1: stop tracking dependencies; repair setup; establish auth/HTTP contract and isolated test DB. Owner: backend; reviewer: team assignment pending.
2. Task 2: Users, RoomTypes, Rooms, Guests with validation, role checks, audit, references, and HTTP tests. Owner: backend; reviewer: team assignment pending.
3. UI team: install client dependencies and decide frontend stack before UI work. Owner/reviewer: team assignment pending.

## File register

Each row records path, purpose, current state, evidence, requirement gap/risk, next action, and owner. Lockfiles and binary assets were inspected by metadata and references rather than byte by byte. Generated dependencies are represented by the Git hygiene finding above, rather than one row per package file.

| Path | Purpose | Status | Evidence | Gap / risk | Action | Owner |
|---|---|---|---|---|---|---|
| .DS_Store | macOS folder metadata (removed from index) | ล้าสมัย / removed | Git commit e0b4217 removed metadata from index | none remaining in index | none | team |
| .gitignore | ignore rules for local/generated files | ผ่าน (อ่านแล้ว) | tracked path/contents or metadata reviewed | tracked dependencies/metadata | Git hygiene | team |
| BACKEND_WORK_PLAN.md | authoritative Task 1–5 backend work plan | ผ่าน (อ่านแล้ว) | tracked path/contents or metadata reviewed | tracked dependencies/metadata | Git hygiene | team |
| README.md | Repository config / placeholder / plan | ผ่าน (อัปเดต) | setup guide updated and reviewed | production migration still gated | keep setup aligned with routes | team |
| client/.DS_Store | macOS folder metadata (removed from index) | ล้าสมัย / removed | Git commit e0b4217 removed metadata from index | none remaining in index | none | UI team |
| client/.getkeep | placeholder for client directory | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/README.md | Vite starter instructions | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/eslint.config.js | client lint rules | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/index.html | Vite HTML entry | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/package-lock.json | locked frontend dependencies | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/package.json | frontend scripts/dependencies | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/public/favicon.svg | starter favicon | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/public/icons.svg | icon sprite | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/src/App.css | starter App styles | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/src/App.tsx | React starter root component | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/src/assets/hero.png | starter hero bitmap | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/src/assets/react.svg | React starter logo | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/src/assets/vite.svg | Vite starter logo | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/src/index.css | global client styles | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/src/main.tsx | React bootstrap | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/tsconfig.app.json | frontend TypeScript settings | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/tsconfig.json | TypeScript project references | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/tsconfig.node.json | Vite Node TypeScript settings | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| client/vite.config.ts | Vite build/dev configuration | ต้นแบบ / build ผ่าน | npm ci; npm run lint; npm run build passed | hotel workflows absent | UI team implementation | UI team |
| docs/.gitkeep | placeholder for docs directory | ข้อมูลอ้างอิง | content and cross references reviewed | historical test claims need rerun | retain and update status later | team |
| docs/PLAN/step9-handoff.md | historical Booking handoff and run notes | ข้อมูลอ้างอิง | content and cross references reviewed | historical test claims need rerun | retain and update status later | team |
| docs/step2-data-model.md | proposed data model and validation | ข้อมูลอ้างอิง | content and cross references reviewed | historical test claims need rerun | retain and update status later | team |
| docs/step2-sample-data.json | design-only sample JSON | ข้อมูลอ้างอิง | placeholder hash and translated roomNumber/audit keys | cannot production seed directly | build separate idempotent seed | team |
| docs/step9-booking-service.md | Booking service design and historical test claim | ข้อมูลอ้างอิง | content and cross references reviewed | historical test claims need rerun | retain and update status later | team |
| docs/เอกสารรายงาน/รายงาน3บท/docsfix.md | Design / handoff / report note | ข้อมูลอ้างอิง | content and cross references reviewed | historical test claims need rerun | retain and update status later | team |
| docs/เอกสารรายงาน/รายงาน3บท/hotel_management_academic_report_v1.docx | Project plan / academic reference | ข้อมูลอ้างอิง | PDF text/pages or DOCX metadata reviewed | design/report cannot prove runtime | retain as reference | team |
| docs/เอกสารรายงาน/รายงาน3บท/hotel_management_academic_report_v1.pdf | Project plan / academic reference | ข้อมูลอ้างอิง | PDF text/pages or DOCX metadata reviewed | design/report cannot prove runtime | retain as reference | team |
| docs/เอกสารรายงาน/เค้าโครงโครงงาน/docsfix.md | Design / handoff / report note | ข้อมูลอ้างอิง | content and cross references reviewed | historical test claims need rerun | retain and update status later | team |
| docs/เอกสารรายงาน/เค้าโครงโครงงาน/hotel_management_project_proposal.docx | Project plan / academic reference | ข้อมูลอ้างอิง | PDF text/pages or DOCX metadata reviewed | design/report cannot prove runtime | retain as reference | team |
| docs/เอกสารรายงาน/เค้าโครงโครงงาน/hotel_management_project_proposal.pdf | Project plan / academic reference | ข้อมูลอ้างอิง | PDF text/pages or DOCX metadata reviewed | design/report cannot prove runtime | retain as reference | team |
| docs/แผนงาน/documentPLAN.pdf | Project plan / academic reference | ข้อมูลอ้างอิง | PDF text/pages or DOCX metadata reviewed | design/report cannot prove runtime | retain as reference | team |
| img/.gitkeep | placeholder for image directory | ผ่าน (อ่านแล้ว) | tracked path/contents or metadata reviewed | tracked dependencies/metadata | Git hygiene | team |
| server/.env.example | database and CORS env example | ผ่าน | CORS_ORIGINS example, no secret | deployment origin TBD | set real origin on deploy | backend |
| server/.gitkeep | placeholder for server directory | ต้นแบบ | file and references inspected | env/testing docs or starter UI | keep unless replaced | backend |
| server/app.js | Express REST composition and error path | ผ่าน | Supertest 5 Task 1–2 HTTP tests | no DB readiness yet | Task 5 readiness | backend |
| server/bin/www | HTTP listener bootstrap | ไม่ผ่าน | source returns Jade or placeholder | auth / REST missing | Task 1–2 API | backend |
| server/lib/prisma.js | Prisma Client initialization | ผ่าน (อ่านแล้ว) | file and references inspected | env/testing docs or starter UI | keep unless replaced | backend |
| server/package-lock.json | locked backend dependencies | ผ่าน | npm install and npm ls | dependency findings remain | review dependency upgrades | backend |
| server/package.json | backend scripts/dependencies | ผ่าน | npm ls and isolated tests | npm audit reports 36 findings incl dev; 3 high in Prisma CLI dependency tree | upgrade Prisma in a separate compatibility change | backend |
| server/prisma/schema.prisma | Prisma MongoDB models and indexes | ผ่าน on test DB | Prisma validate and test db push; legacy Room test | production collections/indexes unknown | migration gate before production push | backend |
| server/public/stylesheets/style.css | Express generator stylesheet | ต้นแบบ | file and references inspected | env/testing docs or starter UI | keep unless replaced | backend |
| server/routes/index.js | unused Express generator home route | ไม่ผ่าน | source returns Jade or placeholder | auth / REST missing | Task 1–2 API | backend |
| server/routes/users.js | unused Express generator users route | ไม่ผ่าน | source returns Jade or placeholder | auth / REST missing | Task 1–2 API | backend |
| server/scripts/init-local-mongo.js | local replica-set initialization | ไม่ผ่าน | mongod absent; path fixed to Server 8.0 | not portable | resolve mongod from PATH/config | backend |
| server/scripts/start-local-mongo.ps1 | local Mongo startup helper | ผ่าน (source) | PATH/MONGOD_PATH discovery reviewed; temp binary used in tests | local startup script not run on persistent DB | run with installed mongod when needed | backend |
| server/services/availability-service.js | availability query/business rules | ผ่าน (อ่านแล้ว) | source review; date unit test 8/8 | HTTP and DB integration pending | keep for Task 3 | backend |
| server/services/booking-service.js | booking transaction business rules | ผ่าน in isolated tests | Booking suites passed; inactive guest guarded | Task 3 HTTP routes remain pending | Task 3 | backend |
| server/services/booking-validation.js | date/capacity/price validation | ผ่าน (อ่านแล้ว) | source review; date unit test 8/8 | HTTP and DB integration pending | keep for Task 3 | backend |
| server/tests/availability-service.test.js | availability integration tests | ผ่าน on isolated DB | clean temporary replica set run, 21 Step 9 tests passed | same-process post-concurrency raw write stalls; split runner used | keep isolation and investigate Mongo process | backend |
| server/tests/booking-service.test.js | booking integration tests | ผ่าน on isolated DB | clean temporary replica set run, 21 Step 9 tests passed | same-process post-concurrency raw write stalls; split runner used | keep isolation and investigate Mongo process | backend |
| server/tests/booking-validation.test.js | booking validation unit tests | ผ่าน on isolated DB | clean temporary replica set run, 21 Step 9 tests passed | same-process post-concurrency raw write stalls; split runner used | keep isolation and investigate Mongo process | backend |
| server/tests/test-db.js | guarded Step 9 test fixture/reset helper | ผ่าน on isolated DB | clean temporary replica set run, 21 Step 9 tests passed | same-process post-concurrency raw write stalls; split runner used | keep isolation and investigate Mongo process | backend |
| server/views/error.jade | unused Express error view | ต้นแบบ | file and references inspected | env/testing docs or starter UI | keep unless replaced | backend |
| server/views/index.jade | unused Express home view | ต้นแบบ | file and references inspected | env/testing docs or starter UI | keep unless replaced | backend |
| server/views/layout.jade | unused Express view layout | ต้นแบบ | file and references inspected | env/testing docs or starter UI | keep unless replaced | backend |
| docs/api-task12.md | HTTP contract and examples | ผ่าน | reviewed against routes and tests | Task 3–5 routes not included | extend later | backend |
| docs/openapi-task12.yaml | OpenAPI contract | ผ่าน | openapi-spec-validator valid, 13 paths | not production deployment spec | extend later | backend |
| docs/implementation-audit.md | File audit and gap matrix | ผ่าน | 60 baseline source files inventoried | reviewer still pending | maintain | backend |
| server/lib/auth.js | Bearer session middleware | ผ่าน | HTTP login/me/logout tests | 8 hour token lifetime policy to confirm | review deployment | backend |
| server/lib/http.js | Validation and error contract | ผ่าน | HTTP 400/401/403/404/409 tests | specific Prisma failures may need mapping | extend later | backend |
| server/routes/api-auth.js | Authentication endpoints | ผ่าน | HTTP tests | rate limit is Task 5 | extend later | backend |
| server/routes/api-users.js | User admin CRUD | ผ่าน | HTTP tests | admin concurrency merits stress test | monitor | backend |
| server/routes/api-room-types.js | Room type CRUD | ผ่าน | HTTP tests | reference race on concurrent type delete/create not stress tested | monitor | backend |
| server/routes/api-rooms.js | Room CRUD and legacy mapping | ผ่าน | HTTP tests | reference race on concurrent room delete/booking not stress tested | monitor | backend |
| server/routes/api-guests.js | Guest CRUD/search/masking | ผ่าน | HTTP tests | reference race on concurrent guest delete/booking not stress tested | monitor | backend |
| server/scripts/seed-demo.js | Guarded idempotent demo seed | ผ่าน | two consecutive runs on test DB | not a production migration | demo only | backend |
| server/scripts/test-all-isolated.js | Isolated replica-set regression runner | ผ่าน | 26 tests passed across split runs | Mongo memory process stalls after concurrency when later raw write runs in same DB | keep split until root cause resolved | backend |
| server/tests/task12-http.test.js | Task 1–2 HTTP integration | ผ่าน | 5 tests pass on replica set | coverage is representative, not exhaustive | extend when routes grow | backend |

## Post-implementation verification

- ผ่าน: server npm ci and Prisma 6.19.3 schema validation; OpenAPI 3.0.3 validation (13 paths); npm ci, lint and build for client (still starter UI); Task 1–2 HTTP tests 5/5; existing Step 9 tests 21/21, all on isolated temporary replica sets. The test:all:isolated runner separates the concurrency case from subsequent raw legacy writes because the temporary MongoDB process stalled in that sequence. Total 26/26 test cases passed across isolated runs.
- ไม่ผ่าน: Repo has 36 npm audit findings including development dependencies. Runtime dependency audit has 3 high findings in the Prisma CLI dependency tree; upgrading Prisma needs a separate compatibility change. UI has no hotel workflow.
- ยังรันไม่ได้: No production DB URL, counts, samples, backup or index inventory was provided, so existing hotel_lobby data and a production db push cannot be accepted. Reviewer assignment and live deployment remain pending.
- Git hygiene: commit e0b4217 removed 6,799 tracked dependency files and two .DS_Store files from the index; local files were preserved. .gitignore now excludes generated dependencies, env files, build/cache output and metadata.

## Task 3 update — 8 October 2026

ส่วนด้านบนเป็น baseline/ผลตรวจรับ Task 1–2 ณ เวลานั้น. Task 3 ต่อจาก service เดิม เพิ่ม staff Booking API และ availability ภายในหลัง auth ของทั้ง admin/receptionist; actor มาจาก session เท่านั้น. [Contract](api-task3.md), [OpenAPI](openapi-task3.yaml), [หลักฐานการรันและ commits](task3-acceptance.md) เป็นข้อมูลปัจจุบันของ Task 3.

อ่าน service ทั้งสามและ tests เดิมก่อนแก้. รักษา date/availability rules และ schema เดิม; ซ่อม snapshot เมื่อแก้ guest/count, repricing เมื่อเปลี่ยนห้อง/วัน, ObjectId casing และ retry ของ P2034. ไม่แก้ไฟล์ `booking-validation.js` หรือ `availability-service.js` และไม่เพิ่มกฎซ้ำใน HTTP routes.

| Path | จุดประสงค์/หลักฐาน | สถานะ/ข้อจำกัด |
|---|---|---|
| server/services/booking-service.js | Snapshot/repricing, retry ทั้ง transaction 3 attempts, scoped claim conflict mapping; service/HTTP/race tests | ผ่าน; price integer baht และ payment guards เดิม |
| server/services/booking-claims-maintenance.js | Read-only audit และเติม missing claims ต่อ booking แบบ idempotent | ผ่านบนฐานแยก; ข้อมูลชน/refs หาย/extra claims ต้องแก้ก่อน apply |
| server/routes/api-availability.js | Service เดิมและ pagination หลังกรอง; tests PII/roles/query | ผ่าน; candidates ยังอ่านทั้งชุด |
| server/routes/api-bookings.js | List/detail/create/update/cancel, allowlist, req.actor.id | ผ่าน; ไม่มี UI/operations/payment endpoints |
| server/app.js | Mount routes หลัง requireAuth; availability ก่อน rooms/:id | ผ่าน HTTP tests |
| server/scripts/booking-claims.js | CLI ต้องระบุชื่อฐานตรง URL; default audit; apply ต้องยืนยัน maintenance prerequisites | ผ่าน CLI tests; flags ไม่หยุด traffic/สร้าง backup ให้ |
| server/scripts/test-all-isolated.js | Async child runner และ temporary replica sets; tests เดิมและ Task 3 ครบ | ผ่าน; รักษาการแยก legacy/race คนละ instance |
| server/tests/booking-service.test.js | Legacy driver connect ใน try/finally พร้อม timeout ชัดเจน | ผ่าน; ไม่ตัด assertions/test เดิม |
| server/tests/task3-db.js | Guard local replica set/ชื่อฐาน, fixtures และ claims/payment consistency checker | ผ่าน; ฐาน hotel_lobby_task3_test เท่านั้น |
| server/tests/task3-hooks.js | Test-only barrier/failure instrumentation ที่ยังเขียน MongoDB จริง | ผ่าน race/rollback tests; ไม่ถูก import ใน production |
| server/tests/task3-invariants.test.js | 3 cases: DB guard, three holding statuses, live indexes/unique enforcement | ผ่าน |
| server/tests/task3-service.test.js | 8 cases: snapshot, repricing, guards และ retry/rollback | ผ่าน |
| server/tests/task3-http.test.js | 22 cases: both roles, spoofed actor, validation, overlap/errors/pagination | ผ่าน |
| server/tests/task3-race.test.js | 16 cases: four race pairs ×3, same-booking edits, late rollback ×3 | ผ่าน |
| server/tests/task3-claims.test.js | 8 cases: audit/backfill/CLI/rollback/index/reference guards | ผ่าน |
| server/package.json | เพิ่ม db:claims script | ผ่าน CLI tests; dependencies/lockfile เดิม |
| docs/api-task3.md | Contract และ maintenance/runbook | ตรวจเทียบ routes/service/tests แล้ว |
| docs/openapi-task3.yaml | 4 paths / 6 operations | OpenAPI validator ผ่าน |
| docs/task3-acceptance.md | คำสั่งจริง, versions, tests, commits, ข้อจำกัด | ผล backend acceptance; ไม่ใช่ production deployment |
| README.md | Setup/test/Booking links และ claims maintenance | อัปเดตตาม Task 3 |
| docs/api-task12.md | ส่งต่อ contract ไป Task 3 | Task 1–2 contract เดิม |
| docs/step9-booking-service.md | ชี้สถานะใหม่และกำกับบันทึกเดิมเป็นประวัติ | API ปัจจุบันอ้าง Task 3 |
| docs/PLAN/step9-handoff.md | ชี้สถานะใหม่และกำกับ handoff 7 ต.ค. เป็นประวัติ | เก็บหลักฐานเก่าไว้ |

ระหว่างตรวจ Task 3 พบ legacy test timeout ที่ MongoClient handshake แม้ใช้ replica set ใหม่; runner ใช้ spawnSync ทำให้ parent ไม่รับ output ของ mongod ระหว่าง Jest. ซ่อมเป็น async spawn แล้ว tests เดิมและใหม่ผ่านครบ โดยไม่ skip กรณีดังกล่าว. โค้ดสุดท้ายผ่าน 83/83 cases สองรอบจากฐานสะอาดใหม่ รวม race/rollback/index/claims; Prisma schema และ OpenAPI validate ผ่าน. ไม่ได้ใช้เพียงผลทดสอบเก่าเป็นหลักฐาน.

ฐานจริงยังไม่ได้ตรวจ/backup/push/backfill. ก่อนเปิด Booking API กับฐานเก่า ต้องหยุด writes, ตรวจ target, สำรอง/ทดลองสำเนา และผ่าน claims/index audit. ผลชุดทดสอบใช้ temporary single-node replica sets ไม่ครอบคลุม production failover. UI/Public API/Task 4–5 และ reviewer/merge/deployment ยังแยกจาก backend Task 3.

## Task 4 update — 9 October 2026 (Asia/Bangkok)

ส่วนก่อนหน้าเป็นประวัติ Task 1–3. Task 4 เพิ่ม payment ledger และ operations ตามข้อตกลง summary+ledger, integer baht, refund เฉพาะ confirmed, Bangkok calendar และ checkout สุทธิครบ. ผลล่าสุด: [acceptance](task4-acceptance.md), [contract](api-task4.md), [OpenAPI](openapi-task4.yaml), [reconciliation](payment-reconciliation.md).

| Path | จุดประสงค์/หลักฐานปัจจุบัน | สถานะ |
|---|---|---|
| server/prisma/schema.prisma | PaymentTransaction/unique evidence+key, ledgerReady, Booking version; validate/generate/live test indexes | ผ่านบนฐานทดสอบ |
| server/services/operation-transaction.js | Active staff guard, 3-attempt whole-transaction retry, shared version write | ผ่าน fresh-read/retry/race tests |
| server/services/payment-ledger.js | Normalize evidence, derive summary, verify source totals and summary consistency | ผ่าน unit/integration |
| server/services/payment-reconciliation.js | Read-only audit and atomic verified-evidence import; no inferred opening balances | ผ่าน legacy/rollback/rerun |
| server/services/payment-service.js | Receipt/refund, global replay, evidence collision, source/state/cumulative guards | ผ่าน service/HTTP/atomic |
| server/services/booking-service.js | Ready summary creation, ledger-aware edit/cancel, version write and refunded status | ผ่าน Task 3 regression + Task 4 |
| server/services/booking-validation.js | Enforce Prisma Int price range before writes | ผ่าน regression/maximum-price tests |
| server/services/stay-service.js | Bangkok calendar, guarded check-in/out, atomic room state, original claims retained | ผ่าน stay/atomic/HTTP |
| server/routes/api-operations.js | Six authenticated operations, allowlists/pagination/session actor | ผ่าน HTTP cases |
| server/routes/api-bookings.js | Export existing Booking presenter for consistent operation responses | ผ่าน Task 3/4 HTTP |
| server/app.js | Mount operations behind auth; allow Idempotency-Key CORS header | ผ่าน HTTP/CORS |
| server/scripts/payment-ledger.js | Default audit, explicit database reconcile and live unique-index checks | ผ่าน CLI tests |
| server/scripts/test-all-isolated.js | Include seven Task 4 suites alongside original suite groups | ผ่าน runner exit 0 |
| server/package.json | db:payments command; dependency versions unchanged | ผ่าน CLI |
| server/tests/test-db.js | Ledger fixture and refund-first cleanup; synthetic vouchers only | ผ่าน all dependent suites |
| server/tests/payment-fixture.js | Service-based synthetic receipt/refund helpers | ผ่าน Task 3/4 guards |
| server/tests/task3-db.js | Async schema push, local Task 3/4 allowlist, replica-set lifecycle | ผ่าน regression/legacy fields |
| server/tests/task12-http.test.js | Async schema setup with skip-generate; original assertions retained | ผ่าน 5 cases |
| server/tests/booking-service.test.js | Replace direct paid/refunded writes with actual test ledger/service calls | ผ่าน 10 cases across split runs |
| server/tests/task3-service.test.js | Service ledger fixture preserves original repricing/refund/retry assertions | ผ่าน 8 cases |
| server/tests/task3-http.test.js | Service receipt fixture preserves original route/payment guard assertions | ผ่าน 22 cases |
| server/tests/payment-ledger.test.js | Unit amount/date/status/cumulative checks | ผ่าน 10 cases |
| server/tests/task4-reconciliation.test.js | Evidence, target, legacy fields, duplicate index and read-only CLI | ผ่าน 6 cases |
| server/tests/task4-payment.test.js | Money lifecycle, duplicate/replay and corrupt/legacy guards | ผ่าน 4 cases |
| server/tests/task4-booking.test.js | Cancel/reprice history and maximum cumulative amount | ผ่าน 4 cases |
| server/tests/task4-stay.test.js | Calendar, room/occupant state, payment and zero-price behavior | ผ่าน 8 cases |
| server/tests/task4-http.test.js | Auth, both roles, payload/response allowlists, replay and CORS | ผ่าน 7 cases |
| server/tests/task4-atomic.test.js | Real-transaction failure injection, bounded retry and synchronized races | ผ่าน 44 cases |
| docs/api-task4.md | Decision/transition/error and API contract | ตรวจเทียบ implementation/tests |
| docs/openapi-task4.yaml | Six endpoints and response/request schemas | Swagger CLI validation ผ่าน |
| docs/payment-reconciliation.md | Maintenance, verified evidence shape, recovery and write reopening | ตรวจเทียบ CLI/service; live procedure ยังไม่รัน |
| docs/task4-acceptance.md | Runtime, commands, case counts and commit sequence | ผลรันจริง 166/166 |
| docs/step2-data-model.md | Correct cumulative limits, ledger model and readiness/version semantics | ปรับให้ตรง schema |
| docs/api-task3.md | New readiness/consistency errors and monetary API handoff | ปรับตาม guards ใหม่ |
| docs/step9-booking-service.md | Mark Task 4 integration; preserve Step 9 historical record | อัปเดต |
| docs/PLAN/step9-handoff.md | Bangkok/payment/operations handoff | อัปเดต |
| README.md | Task 4 links, guarded data rollout and isolated runner | อัปเดต |
| docs/implementation-audit.md | Per-file update and current acceptance evidence | อัปเดตนี้ |

ผลสุดท้าย: Prisma validate/generate ผ่าน, OpenAPI Swagger validation ผ่าน, runner ผ่าน 166/166 cases (เดิม 83 + Task 4 83), git diff --check ผ่าน. ระหว่างรันพบ synchronous schema setup ทำให้ mongod pipe ค้างบน Windows; ซ่อม helpers เป็น async และ rerun ผ่านโดยไม่ลบ/skip assertions. ไม่มี schema push/reconcile ไป hotel_lobby หรือฐานจริง. Production backup/restore, deployment, frontend และ reviewer/merge ยังอยู่นอกผลตรวจรับ backend นี้.

## Task 5 update — 9 October 2026

Scope: additive backend Task 5 only, no schema/data-model migration or UI rewrite. Read current app/auth/error/availability/booking/operation services and schema/test harness before edits. Current requirement evidence and explicit pending work are in `task5-acceptance.md`; the original baseline above is retained as history.

| File | Purpose/change | Current evidence and remaining risk |
|---|---|---|
| server/app.js | Public route before staff auth, dashboard, bounded parser, readiness/security/login limiter | HTTP/security/role tests passed |
| server/lib/security.js | Bounded per-process rate limiter and headers/URL guard | 429, expiry, header checks; shared proxy limiter pending deployment |
| server/lib/http.js | Log only request ID and generic server error code | Inspected; avoids database/query error payload exposure |
| server/bin/www | SIGINT/SIGTERM drain/disconnect/deadline | Inspected; real deployment signal handling pending |
| server/services/dashboard-service.js | Shared availability, Bangkok day, ledger aggregate report | Fixture/boundary/role/full-flow tests |
| server/routes/api-dashboard.js | Staff counts/admin-only report, reject query | 401/403/400/200 tests |
| server/routes/api-availability.js | Reuse existing handler for anonymous public read | Public/staff parity and five-field allowlist |
| server/scripts/lint.js | Portable backend syntax validation | All backend JS checked; not a style linter |
| server/scripts/smoke-public.js | Independent process real HTTP public consumer | ready, 200, one demo room; exact fields verified |
| server/scripts/test-all-isolated.js | Include Task 5 after regression groups | Runner exit 0, original 166 cases retained |
| server/tests/task3-db.js | Add explicitly guarded Task 5 temporary DB name | Production URL rejected; fresh replica sets |
| server/tests/task5.test.js | Counts/roles/public/security/full flow/Postman artifacts | Final seven cases pass |
| server/package.json | lint and test:task5 commands | Commands executed; dependency versions unchanged |
| server/.env.example | Public browser origin allowlist and port | No secrets; local .env remains ignored |
| .github/workflows/backend.yml | Install/generate/validate/lint/all tests on CI | Configuration supplied; remote CI pending |
| docs/api-task5.md | New API/security/role/count definitions and limits | Compared with handlers and HTTP assertions |
| docs/openapi-task5.yaml | Additive Task 5 OpenAPI, JSON-compatible YAML | Swagger CLI validation passed |
| docs/hotel-lobby.postman_collection.json | Runnable 17-request Task 1–5 demo with saved variables | Executed against real HTTP by test harness |
| docs/task5-runbook.md | Fresh setup, tests, deploy/rollback, UI/demo handoff | Guide supplied; actual deploy/recovery rehearsal pending |
| docs/dependency-audit-task5.json | Current server/client audit snapshots including omit-dev exposure | Three high omit-dev advisories remain; release follow-up documented |
| docs/task5-acceptance.md | Current requirement/evidence/limitations matrix | Separates verified backend from CI/deploy/UI/reviewer |
| docs/api-task12.md | Clarify Bangkok/public auth exception versus historical text | Updated to current routing policy |
| docs/step2-data-model.md | Mark historical design; current schema/Room map authoritative | No schema changes in Task 5 |
| docs/step9-booking-service.md | Record shared availability reuse and retained claims | Regression and public parity tests |
| README.md | Task 5 commands/contracts/tests/runbook | References verified against delivered files |
| docs/implementation-audit.md | Per-file audit and evidence update | This register; Task 5 owner is requesting user, reviewer pending |

Security inventory: tracked node_modules count is zero; only .env.example is tracked among env files. npm audit currently reports server 36 advisories overall and three high advisories with --omit=dev (Prisma/config/deepmerge-ts); client has one high source-map-js advisory. Server suggested remediation changes Jest major and Prisma version; do not treat a forced incompatible downgrade as completed hardening. Preserve this as a separately assessed dependency follow-up. No production migration/deployment/reviewer approval claimed. Current backend tests cover 173 distinct cases (166 regression + seven Task 5); no UI completion implied.

### Task 5 remediation (supersedes dependency follow-up above)

| File | Final change | Evidence |
|---|---|---|
| server/package.json and server/package-lock.json | Jest 30.5.2; deepmerge-ts 8.0.2 and Istanbul js-yaml 4.3.2 overrides; Prisma stays 6.19.3 | npm ci in clean source snapshot; Prisma generation/validation; all 173 regression/integration cases passed |
| client/package-lock.json | source-map-js 1.2.2 | npm audit zero; lint/build passed |
| docs/dependency-audit-task5.json | Replaced old snapshot with current zero-advisory server/server-omit-dev/client reports | npm audit and omit-dev zero |
| .github/workflows/backend.yml | Audit gates and client lint/build added to backend CI | Local equivalent checks pass; authenticated remote run pending |
| server/bin/www | Explicit listening/readiness message | Source syntax check passed; live readiness returned ready |
| .gitignore | Ignore three machine-specific setup launchers | Local files retained; not included in PR |
| docs/task5-runbook.md | Background local-run and dependency remediation guide | Existing-ready launcher detection passed |
| docs/task5-acceptance.md | Updated current evidence, fresh setup and pending GitHub authentication | No remote CI/reviewer success fabricated |

Existing backend on port 3000 responded ready from PowerShell. Background launcher detected it without stopping it. No production deployment is required for the selected local-run handoff. A real team reviewer must still review the eventual PR.
