# Hotel-Lobby

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

ทดสอบ: `npm run test:all:isolated` เปิด replica set ชั่วคราว, ใช้ฐานแยก `hotel_lobby_step9_test` และ `hotel_lobby_task12_test`, push schema เฉพาะฐานเหล่านั้น แล้วรัน 26 tests; ถ้ามี `mongod` อยู่แล้วตั้ง `MONGOD_PATH` เพื่อไม่ต้องดาวน์โหลด binary ขนาดใหญ่ หรือใช้ `npm test -- --runTestsByPath tests/task12-http.test.js` สำหรับ Task 1–2 โดยเฉพาะ ชุด Step 9 เดิมใช้ฐานแยกตาม `server/tests/test-db.js` ปัจจุบัน UI ใน `client` ยังเป็น starter แม้ `npm ci`, lint และ build ผ่านแล้ว
