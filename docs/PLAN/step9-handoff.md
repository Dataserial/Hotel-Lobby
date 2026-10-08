# ส่งต่องานหลัง Step 9: Booking service

สถานะปัจจุบัน 8 ต.ค. 2026: Task 1–2 มี auth แล้ว และ Task 3 ผูก Booking/availability routes หลัง auth พร้อม tests เพิ่ม ดู [API Task 3](../api-task3.md) และ [ผลตรวจรับ](../task3-acceptance.md). เนื้อหาถัดไปเก็บเป็นบันทึก handoff เดิมวันที่ 7 ต.ค.; ข้อความว่ายังไม่มี auth/HTTP routes ไม่ใช่สถานะล่าสุด.

อัปเดต 7 ตุลาคม 2026 — งาน Step 9 อยู่บน branch `develop` ใน 7 commits ล่าสุด รายละเอียดกฎ service และ error codes อยู่ที่ [`../step9-booking-service.md`](../step9-booking-service.md) ส่วนแบบข้อมูลและตัวอย่างอยู่ที่ [`../step2-data-model.md`](../step2-data-model.md) และ [`../step2-sample-data.json`](../step2-sample-data.json)

## สิ่งที่ทำแล้ว

- เพิ่ม Prisma models ที่ booking service ต้องใช้ และ unique index `(roomId, night)` บน `RoomNightClaim`
- ทำ `findAvailableRooms`, `createBooking`, `updateBooking`, `cancelBooking` ใน `server/services` พร้อม validation วันพัก ราคา จำนวนผู้พัก และ error codes
- สร้าง/แก้/ยกเลิก Booking กับ claims ใน Prisma transaction; การสร้างบันทึก Payment summary เริ่มต้น แต่ยังไม่มีการรับเงินจริง
- มี Jest integration tests กับฐาน `hotel_lobby_step9_test`: 3 suites / 21 tests ผ่าน รวมสองคำขอที่แย่งห้องคืนเดียวกันซึ่งสำเร็จเพียงหนึ่ง และตรวจไม่พบ orphan หรือ cancelled claims
- ยัง **ไม่มี** Booking HTTP routes, auth, Booking UI, check-in/out หรือ public availability API

## ข้อสำคัญก่อนนำไปต่อ

1. **ฐานข้อมูลจริงยังไม่ได้รับ schema นี้** ตอนเริ่มงาน MongoDB ที่ README ระบุไม่ทำงาน จึงตรวจข้อมูลเดิมจริงไม่ได้ การ `db push` และทดสอบทำกับ replica set ชั่วคราวและฐาน `hotel_lobby_step9_test` เท่านั้น ก่อน push ไป `hotel_lobby` หรือฐาน production ให้สำรองข้อมูล ตรวจ collections/index และข้อมูลห้องเดิมก่อน โดยเฉพาะเลขห้องซ้ำหรือเอกสารที่ขาดฟิลด์
2. **อย่าเปลี่ยน `Room.number` หรือ collection `Room` โดยไม่ย้ายข้อมูล** Prisma model เดิมเก็บที่ collection `Room` และฟิลด์ `number`; schema ใหม่คง mapping นี้ไว้ ห้องเก่าที่มีเพียงเลขห้องยังอ่านได้ แต่ยังจองไม่ได้จนมี `roomTypeId`, `status: available` และ `active: true` ที่ถูกต้อง งาน Room CRUD/seed ต้องเติมข้อมูลเหล่านี้อย่างระวัง
3. **อย่าเปิด write route ที่ client กำหนด `actorId` เอง** Service รับ `actorId` จากผู้เรียกที่เชื่อถือได้และตรวจ User ที่ active เพื่อบันทึก audit แต่ยังไม่มี auth/role middleware ให้ทำ Step 5 ก่อนผูก route; อนุญาตเฉพาะ `admin`/`receptionist` ตามแผน
4. **claims คือหลักประกันกันจองซ้อน** การค้นหาห้องว่างเป็นเพียงข้อมูลให้เลือก ห้องอาจถูกจองระหว่างค้นหากับยืนยัน ต้องรับ `409 ROOM_UNAVAILABLE` จาก unique index และให้ผู้ใช้เลือกใหม่ ห้ามแทนที่ transaction/unique index ด้วย overlap query อย่างเดียว
5. **วันพักคือวันปฏิทินของโรงแรม** ใช้ `YYYY-MM-DD`, ช่วง `[checkInDate, checkOutDate)`, สูงสุด 365 คืน; วันออกไม่ถูก claim ราคาเป็นจำนวนเต็มบาทและ Booking เก็บราคา snapshot
6. **ยอดเงินที่รับแล้วต้องจัดการก่อนแก้ราคา/ยกเลิก** Service คืน `PAYMENT_ADJUSTMENT_REQUIRED` หรือ `PAYMENT_REFUND_REQUIRED` หากยอดรับสุทธิยังต้องปรับ/คืน งานรับและคืนเงินจริงพร้อมบันทึกยอดเป็น Step 11; อย่าแก้ตัวเลข payment เพื่อผ่าน guard โดยไม่มีรายการเงินจริง

## งานถัดไปตามลำดับที่เชื่อมกัน

| งาน | สิ่งที่ต้องทำ | เกณฑ์ตรวจรับ |
|---|---|---|
| Step 4/7/8 ที่ยังขาดใน repository | ทำการจัดการ User, RoomType, Room, Guest และ seed ที่ใช้ข้อมูลจริงตาม Step 2; เติมฟิลด์ห้องเดิมโดยไม่ลบเลขห้อง | guest/room/room type ที่ active มีอยู่และ service ใช้ได้; ห้องเก่ายังคงเลขเดิม |
| Step 5: Auth และสิทธิ์ | Login/logout, hash password, session/JWT, role middleware; ส่ง `actorId` จาก identity ที่ยืนยันแล้ว | ผู้ไม่ login หรือ role ไม่พอเรียก write route ไม่ได้; client ปลอม `actorId` ไม่ได้ |
| Step 10: Booking routes/UI | ผูก service ผ่าน route ที่ป้องกันแล้ว; ทำค้นหาห้อง เลือก guest สรุปราคา ยืนยัน แก้/ยกเลิก และรายการ/ตัวกรอง | แสดง `ROOM_UNAVAILABLE` และ payment/transition errors ชัดเจน; ทดสอบ route ด้วย Supertest หลังมี auth |
| Step 11: Operations/Payment | รับและคืนเงินจริงภายนอก บันทึกยอด/วิธีชำระ และ check-in/out ที่ sync Booking, Room, Payment ใน transaction | ห้อง/booking/payment เปลี่ยนสถานะตรงกัน; ยกเลิกหลังรับเงินได้เมื่อคืนเงินและบันทึกครบเท่านั้น |
| Step 12: Public availability | ทำ read-only API, rate limit/CORS และ response ที่ไม่เปิดข้อมูล guest/user/payment | เรียกจากภายนอกได้ตามสัญญา API และไม่รั่วข้อมูลส่วนบุคคล |

## วิธีรันทดสอบซ้ำ

ต้องมี MongoDB replica set `rs0` ที่ `127.0.0.1:27018` สคริปต์ `npm run db:local` ใน README อ้าง `mongod.exe` ที่ `C:\Program Files\MongoDB\Server\8.0\bin` ซึ่งไม่พบในเครื่องตอนทำ Step 9; ตรวจ path/ติดตั้งให้ตรงก่อนใช้ คำสั่งด้านล่าง **ล้างและ seed ฐานทดสอบ** ผ่าน Jest; ห้ามเปลี่ยน URL เป็น `hotel_lobby`:

```powershell
cd server
npm ci
$env:DATABASE_URL='mongodb://127.0.0.1:27018/hotel_lobby_step9_test?replicaSet=rs0'
npx prisma validate
npx prisma db push
npm test
```

ไฟล์ `server/.env` ไม่มีใน checkout นี้ ให้สร้างจาก `.env.example` เฉพาะเมื่อจะรันแอป และอย่า commit secret ขณะนี้ Git track ไฟล์ใน `server/node_modules` อยู่จำนวนมาก; หลัง `npm ci` หรือ `prisma generate` ให้ตรวจ `git status` และอย่า commit การเปลี่ยน dependencies ที่เกิดจากการติดตั้งโดยไม่ตั้งใจ

## เรื่องที่ทีมต้องตกลงก่อนขยายระบบ

- Timezone ปฏิทินของโรงแรมสำหรับ check-in/out และการแสดง timestamp
- นโยบาย availability ของห้องที่ `occupied` วันนี้แต่จะว่างในอนาคต: Step 9 กรองออกตาม Step 2/PDF
- ราคาเต็มบาทหรือสตางค์ หากเปลี่ยนหน่วยต้องย้ายทั้งระบบก่อนมีข้อมูลจริง
- รูปแบบเอกสาร guest ที่อาจซ้ำกันข้ามประเภท/ประเทศ และขอบเขตการแสดงข้อมูลอ่อนไหว
