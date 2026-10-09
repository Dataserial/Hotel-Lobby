# Hotel-Lobby

## Task 5 — Dashboard / Public API / ส่งมอบ backend

เพิ่ม `GET /api/dashboard` (admin/receptionist), `GET /api/dashboard/report` (admin) และ `GET /api/public/rooms/availability` (anonymous, 60 requests/IP/minute) โดยใช้ Booking availability service เดิม. Hotel timezone ใช้ Asia/Bangkok ตาม check-in/out; ราคาเป็นจำนวนเต็มบาท. `/ready` ตรวจ MongoDB แยกจาก `/health`.

อ่าน [contract Task 5](docs/api-task5.md), [OpenAPI](docs/openapi-task5.yaml), [Postman demo Task 1–5](docs/hotel-lobby.postman_collection.json), [setup/test/deploy/UI handoff](docs/task5-runbook.md) และ [ผลตรวจรับปัจจุบัน](docs/task5-acceptance.md). ตั้ง `CORS_ORIGINS` สำหรับพนักงานและ `PUBLIC_CORS_ORIGINS` สำหรับ consumer โดยระบุ origin จริง; localhost กับ 127.0.0.1 ต่างกัน.

ใน `server`: `npm run lint`, `npx prisma validate`, `npm run test:task5`, `npm run test:all:isolated`. หลังเปิด MongoDB/demo database แล้ว `node scripts/smoke-public.js` ทดสอบ Public API จาก HTTP client อีก process. GitHub Actions อยู่ที่ `.github/workflows/backend.yml`; ยังไม่อ้างว่า remote CI/deploy หรือ frontend integration ผ่านจนมีผลจริง.

## MongoDB และ Prisma

ฝั่ง `server` ใช้ Prisma 6 เชื่อม MongoDB replica set. โค้ดยังคง `Room.number` และ collection `Room` เดิม คำสั่ง `db:push` เปลี่ยนโครงสร้าง/ดัชนีของฐานเป้าหมาย จึงต้องตรวจข้อมูล, สำรอง และทดสอบสำเนาตาม `docs/implementation-audit.md` ก่อนใช้กับฐานที่มีข้อมูล

```powershell
cd server
npm ci
npm run db:generate
npm run db:local
npm start
```

คัดลอก `server/.env.example` เป็น `server/.env` และแก้ `DATABASE_URL` ให้ตรงฐานที่ตั้งใจใช้ ตัวอย่างในไฟล์ชี้ `hotel_lobby`; **อย่ารัน `db:push` กับฐานนี้โดยไม่ผ่านขั้นตอนตรวจและสำรองข้อมูล** เริ่มทดลองจากฐานแยกชื่อ `hotel_lobby_task12_demo` แล้วตั้ง `DATABASE_URL` ไปฐานนั้น ค่อยรัน `npm run db:push` และ `npm run db:seed:demo` (ตั้ง `DEMO_ADMIN_EMAIL` และ `DEMO_ADMIN_PASSWORD` ก่อน) จากนั้น `npm start` API อยู่ที่ `/api` และ health ที่ `/health`; contract ดู `docs/api-task12.md`

`npm run db:local` มองหา `mongod` จาก `MONGOD_PATH`, PATH หรือโฟลเดอร์ MongoDB Server ใน Program Files ตามลำดับ และเปิด replica set `rs0` พอร์ต `27018` โดยเก็บข้อมูลใน `server/.local-mongo/data` หากใช้ MongoDB service/Atlas อยู่แล้ว ให้ตั้ง `DATABASE_URL` ไปยัง replica set นั้นแทน

Task 3 เพิ่ม Booking API สำหรับ admin/receptionist หลัง auth และ availability ภายในที่ `/api/rooms/availability`; contract และวิธี audit/backfill claims อยู่ที่ [docs/api-task3.md](docs/api-task3.md), OpenAPI ที่ [docs/openapi-task3.yaml](docs/openapi-task3.yaml). Write routes ใช้ actor จาก session เท่านั้น และเรียก service เดิมเพื่อสร้าง/แก้/ยกเลิกพร้อม claims/payment ใน transaction.

Task 4 เพิ่ม ledger รับ/คืนเงินและ check-in/out โดยเก็บ Payment summary เดิมไว้: [contract](docs/api-task4.md), [OpenAPI](docs/openapi-task4.yaml), [reconciliation runbook](docs/payment-reconciliation.md). รับ/คืนเงินต้องอ้างหลักฐานจริงและส่ง `Idempotency-Key`; ไม่มี API แก้ยอดสะสมตรง ๆ. ข้อมูลเก่าต้อง reconcile ก่อนแก้ booking/รับหรือคืนเงิน/check-in/out.

ทดสอบ: `npm run test:all:isolated` เปิด replica sets ชั่วคราว ใช้ฐานแยก `hotel_lobby_step9_test`, `hotel_lobby_task12_test`, `hotel_lobby_task3_test`, `hotel_lobby_task4_test` และ push schema เฉพาะฐานเหล่านั้น. ถ้ามี `mongod` อยู่แล้วตั้ง `MONGOD_PATH` เพื่อไม่ต้องดาวน์โหลด binary เพิ่ม เช่น `$env:MONGOD_PATH='C:/Program Files/MongoDB/Server/7.0/bin/mongod.exe'`. ตั้ง `MONGOMS_VERSION` ให้ตรง binary เช่น `7.0.8` เพื่อเลี่ยง warning version. Runner รัน child processes แบบ async เพื่อรับ output จาก MongoDB ต่อเนื่อง และแยก legacy raw-write/race เดิมคนละ instance โดยรันทุก test ครบ. ผลตรวจรับเดิม: [Task 3](docs/task3-acceptance.md); ผลล่าสุด: [Task 4](docs/task4-acceptance.md).

ก่อนเปิด Booking API กับฐานเก่า ให้หยุด writes, สำรองและทดลองสำเนา แล้วรัน `npm run db:claims -- --database <ชื่อฐาน>` เพื่อตรวจ index/references/claims แบบ read-only; อ่านขั้นตอน apply ใน contract ก่อนเติมข้อมูล. เว็บพนักงานใน `client` เชื่อม API ตาม flow หลักแล้ว; วิธีรันอยู่ใน [client/README.md](client/README.md) และผลตรวจใน [docs/bug-ux-fix-acceptance.md](docs/bug-ux-fix-acceptance.md). ยังต้องทดสอบ staging และข้อมูลจริงก่อนเปิด production.
