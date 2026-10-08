# Task 3 acceptance — 8 October 2026

ตรวจรับเฉพาะ backend Booking API ต่อจาก Task 1–2. ก่อนแก้ได้อ่าน `booking-validation.js`, `availability-service.js`, `booking-service.js`, tests เดิม, schema, sample fixtures, auth/HTTP contract และ Task 3 ใน `BACKEND_WORK_PLAN.md`. ไม่มีการเปลี่ยน Prisma schema, collection `Room`, field `number` หรือกฎวันที่/availability เดิม.

## ผลงานและ commits

| Commit | ผลลัพธ์ |
|---|---|
| `164a398` | Test DB guard, index enforcement และ claims invariants |
| `e0dc472` | Price snapshot และ retry ทั้ง transaction สูงสุด 3 attempts |
| `286b532` | Booking/availability HTTP routes หลัง auth และ tests สอง role |
| `c67a481` | Race ทั้งสี่คู่, same-booking edits และ rollback tests |
| `0e1625c` | Read-only claims audit และ guarded idempotent backfill |
| `80ae8f9` | ซ่อม isolated runner ให้ async และปิด legacy client แม้ connect ล้มเหลว |
| `ac2cea6` | เทียบ room ObjectId จากฐานเพื่อคง snapshot เมื่อเปลี่ยนเพียงตัวพิมพ์ hex; เพิ่ม HTTP errors ของ edit/cancel |

เอกสาร/API/OpenAPI และผลตรวจรับบันทึกใน commit สุดท้ายแยกจากโค้ด. [Contract](api-task3.md) ระบุ request/response, roles, errors, repricing และ maintenance prerequisites.

## คำสั่งและหลักฐานจริง

Runtime ที่ใช้รัน: Node **v24.19.0**, npm **11.17.0**, Prisma Client **6.19.3**, MongoDB **7.0.8** บน Windows. Mongo memory server ใช้ `MONGOD_PATH` ไป binary 7.0.8 ที่มีอยู่จริง; warning requested version 8.2.6 ไม่ได้หมายความว่า tests ใช้ 8.2.6.

| คำสั่ง | ผล |
|---|---|
| `npm ci` ใน server | ผ่าน; sandbox DNS ครั้งแรกเข้าถึง registry ไม่ได้ จึงติดตั้งด้วย execution ที่เข้าถึงเครือข่ายได้; lockfile ไม่เปลี่ยน |
| `npm run db:generate` | ผ่าน Prisma Client 6.19.3 |
| `npx prisma validate` พร้อม URL ฐานทดสอบ | ผ่าน; ไม่มีการเชื่อมต่อ/push ฐานจริง |
| `npm exec --yes --package=@apidevtools/swagger-cli@4.0.4 -- swagger-cli validate ../docs/openapi-task3.yaml` | ผ่าน OpenAPI 3.0.3 ทั้ง 4 paths / 6 operations; validator ชั่วคราวใน npm cache ไม่แก้ package/lockfile |
| `npm run test:all:isolated` พร้อม `MONGOD_PATH` | โค้ดสุดท้ายหลังแก้ ObjectId ผ่านครบ **83/83 cases สองรอบ** แต่ละรอบสร้างฐาน/replica sets ชั่วคราวใหม่ทั้งหมด |

สองรอบสุดท้าย: tests เดิมผ่าน 26 cases ทุกรอบ; Task 3 ผ่าน 5 suites / 57 cases ใน 31.812s และ 31.217s ตามลำดับ. Exit code ของ runner เป็น 0 ทั้งสองรอบ. ระหว่างพัฒนายังมี full runs ผ่านก่อนแก้ ObjectId อีกสองรอบ; ไม่ใช้รอบเก่าแทนการตรวจโค้ดสุดท้าย. `git diff --check` ผ่าน และ package-lock/schema/date/availability service เดิมไม่มี diff.

จำนวน tests เดิม 26 และ Task 3 เพิ่ม 57:

| กลุ่ม | Cases | หลักฐาน |
|---|---:|---|
| เดิม: validation / availability / booking / Task 1–2 HTTP | 8 / 3 / 10 / 5 | รันครบ; booking suite แบ่ง 8+1 legacy+1 race คนละ instance |
| Task 3 invariants | 3 | Guard ปฏิเสธฐานจริง/remote/standalone; checked-out claims; index จริงและ duplicate rejection |
| Task 3 service | 8 | Snapshot, repricing, payment guard, retry/rollback/อ่านใหม่ และ bounded attempts ของ create/update/cancel |
| Task 3 HTTP | 22 | สอง roles, token ใช้ไม่ได้, spoofed actor, allowlist, pagination, overlap matrix, adjacent/leap/365 คืน, references/capacity/room status และ errors |
| Task 3 race/rollback | 16 | create-create/edit-create/edit-edit/cancel-create อย่างละ 3 รอบ; same-booking partial edits; late failure ของ create/update/cancel |
| Task 3 claims maintenance | 8 | Read-only, idempotence, three holding statuses, collision/orphan/extra/cancelled claims, reference/date/index errors, rollback และ CLI guards |

Race tests ใช้ barrier ที่ transaction read boundary เพื่อให้คำขอซ้อนกันจริง ใช้ Prisma transaction และ MongoDB จริง; test hooks ไม่อยู่ใน production code. ตรวจ Booking/Payment/claims หลังแต่ละกรณี ผู้แย่งคืนเดียวกันมีผู้ชนะหนึ่งคนและผู้แพ้ 409. cancel-create ยอมรับสองลำดับที่ถูกต้อง และยืนยัน rebook ได้หลัง cancel. การจำลอง late failure/P2034 ใช้ test proxy หลัง DB writes จริงเพื่อพิสูจน์ rollback; ไม่ได้ mock ฐานข้อมูลแทน integration.

ตัวตรวจ consistency เปรียบเทียบ claims ครบทุกคืนตาม `validateStay`, roomId/bookingId ตรงกัน, ไม่มี orphan/คืนซ้ำ/claims ของ cancelled และ Payment summary ไม่ซ้ำหรือ orphan. Cancelled sample เดิมไม่มี Payment ซึ่งเป็น fixture ประวัติ; booking ที่ service สร้างใหม่มี Payment ครบ.

## ปัญหาที่พบและแก้

Baseline เดิมติด timeout ใน legacy test ที่ `MongoClient.connect()` แม้เปิด replica set ใหม่เฉพาะ test; trace พบ handshake timeout ก่อน insert. Runner ใช้ `spawnSync` รัน Jest ใน parent ที่ดูแล mongod ทำให้ event loop ไม่รับ output ของ MongoDB ระหว่าง tests. เปลี่ยนเป็น async `spawn` แล้ว legacy case และทั้ง regression ผ่าน โดยยังเก็บการแยก legacy/race และรันครบทุก case. ปรับ timeout ของ legacy driver ให้ fail ชัดเจนและย้าย connect เข้า `try/finally` เพื่อปิด client เมื่อผิดพลาด.

Prisma `P2034` เดิมถูกเหมารวมเป็นห้องไม่ว่าง; ปัจจุบัน retry ทั้ง transaction สูงสุด 3 attempts แล้วตอบ `409 WRITE_CONFLICT`. Unique error แปลงเป็น `ROOM_UNAVAILABLE` เฉพาะการสร้าง claims. ราคาเดิมคำนวณใหม่แม้แก้เฉพาะ guest/count; ปัจจุบันคง snapshot และคำนวณจากราคาปัจจุบันเมื่อเปลี่ยนห้อง/วันจริงตามที่ผู้ใช้เลือก.

## ขอบเขตหลักฐาน

ฐานที่ใช้มีเพียง `hotel_lobby_step9_test`, `hotel_lobby_task12_test`, `hotel_lobby_task3_test` บน temporary local replica sets. ไม่ได้ตรวจ/push schema/seed/backfill ฐาน `hotel_lobby` หรือ production; ต้องผ่านขั้นตอนหยุด writes, backup, ทดลองสำเนาและ audit ก่อนเปิด Booking API กับฐานเก่า. ผลทดสอบ single-node replica set นี้ไม่ได้พิสูจน์ failover หรือโหลด production.

Availability ใช้ service เดิมและ paginate หลังกรอง จึงจำกัด response แต่ยังอ่าน candidates ทั้งชุด. Task นี้ไม่มี UI, public API, operations/payment ledger, deployment หรือการรับ/คืนเงินจริง. Dependency audit จาก npm ci ยังคงพบ 36 findings (5 moderate, 31 high); งานนี้ไม่ได้อัปเกรด dependencies. Reviewer/merge และ deployment เป็นขั้นตอนทีมแยกจากผลทดสอบนี้.
