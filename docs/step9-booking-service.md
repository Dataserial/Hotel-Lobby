# Step 9 — Booking service และการกันจองซ้อน

## ขอบเขตและการเรียกใช้

โมดูล CommonJS ใน `server/services` ยังไม่มี HTTP route หรือ Booking UI:

```js
const { findAvailableRooms } = require('./services/availability-service');
const { createBooking, updateBooking, cancelBooking } = require('./services/booking-service');

const rooms = await findAvailableRooms(prisma, {
  checkInDate: '2026-10-10', checkOutDate: '2026-10-12', guestCount: 2,
});
const booking = await createBooking(prisma, {
  guestId, roomId, guestCount: 2,
  checkInDate: '2026-10-10', checkOutDate: '2026-10-12',
}, actorId);
await updateBooking(prisma, booking.id, { checkOutDate: '2026-10-13' }, actorId);
await cancelBooking(prisma, booking.id, actorId);
```

`actorId` ต้องมาจากชั้น authentication ที่เชื่อถือได้เท่านั้น service ตรวจว่าเป็น User ที่ active และใช้บันทึก `createdById`/`updatedById` แต่ยังไม่มี Step 5 auth จึง **ห้าม** ผูก write endpoint ที่รับ `actorId` จาก body/query/header ของ client หรือปล่อยให้ข้าม auth ได้ Step 5 ต้องเพิ่ม role authorization (`admin`/`receptionist`) ก่อนเปิด route.

## กฎข้อมูล

- วันที่เป็นวันปฏิทินรูป `YYYY-MM-DD` ที่มีอยู่จริง ช่วงพักเป็น `[checkInDate, checkOutDate)` พัก 1–365 คืน; คืนวันออกไม่ถูก claim จึงจองต่อได้
- `findAvailableRooms` คืนเฉพาะห้องและประเภทที่ active, ห้อง status `available`, ความจุพอ และไม่มี `RoomNightClaim` ในคืนที่ค้นหา; ไม่มีข้อมูล guest/payment ในผลลัพธ์
- สร้าง booking ต้องมี guest, room, room type และ actor ที่มีอยู่จริง ห้อง `occupied`/`maintenance` ใช้ไม่ได้ จำนวนผู้พักเป็นจำนวนเต็ม 1–20 และไม่เกิน capacity
- ราคาอ่านจาก `RoomType.basePrice` ฝั่ง server แล้วบันทึก `pricePerNight` และ `totalPrice` เป็นจำนวนเต็มบาทใน Booking; สร้าง Payment summary สถานะ `pending` หรือ `paid` เมื่อยอดเป็นศูนย์ การเปลี่ยนราคาประเภทห้องไม่แก้ booking เดิมอัตโนมัติ
- `RoomNightClaim` มี unique index `(roomId, night)` Booking, Payment และ claims ใหม่อยู่ใน transaction เดียวกัน เมื่อ index ชนจะ rollback และคืน `409 ROOM_UNAVAILABLE` การ query ห้องว่างใช้แสดงผลเท่านั้น ไม่ใช่ตัวรับประกันการจอง
- แก้หรือยกเลิกได้เฉพาะ `confirmed` การแก้ห้อง/วันลบ claims เดิมและสร้างชุดใหม่ใน transaction เดียวกับ Booking/Payment การยกเลิกลบ claims; booking `cancelled` จึงไม่กันห้อง
- ถ้ามียอดรับสุทธิ (`paidAmount - refundedAmount > 0`) ห้ามแก้จนยอดรวมเปลี่ยน (`PAYMENT_ADJUSTMENT_REQUIRED`) และห้ามยกเลิก (`PAYMENT_REFUND_REQUIRED`) จนคืนเงินจริงและบันทึกยอดคืนใน Step 11

Schema คง `Room.number` และ collection MongoDB `Room` จาก Prisma model เดิมไว้ ห้องเก่าที่มีเพียง `number` ยังอ่านได้ แต่ต้องเติม room type, status และ active ผ่านงานจัดการห้องก่อนจองได้ Collection ใหม่ใช้ชื่อพหูพจน์ตาม Step 2.

## ข้อผิดพลาดของ service

`BookingError` มี `status`, `code`, `message` เพื่อให้ route ที่มี auth ในอนาคตแปลงเป็น HTTP response โดยไม่เปิดเผยข้อมูลภายใน:

| HTTP | Code | กรณี |
|---|---|---|
| 400 | `INVALID_DATE_RANGE`, `INVALID_GUEST_COUNT`, `CAPACITY_EXCEEDED`, `INVALID_PRICE`, `INVALID_REFERENCE`, `VALIDATION_ERROR` | รูปแบบหรือกฎข้อมูลไม่ผ่าน |
| 403 | `INVALID_ACTOR` | ผู้ดำเนินการไม่มีอยู่หรือถูกปิด |
| 404 | `GUEST_NOT_FOUND`, `ROOM_NOT_FOUND`, `BOOKING_NOT_FOUND` | ไม่พบข้อมูลอ้างอิง |
| 409 | `ROOM_UNAVAILABLE` | ห้องปิด/ไม่พร้อม หรือคืนชน unique index |
| 409 | `INVALID_TRANSITION` | แก้/ยกเลิก booking ที่ไม่ใช่ `confirmed` |
| 409 | `PAYMENT_ADJUSTMENT_REQUIRED`, `PAYMENT_REFUND_REQUIRED` | ต้องจัดการยอดเงินภายนอกก่อน |

## รันและตรวจรับ

ต้องมี MongoDB replica set `rs0` ที่ `127.0.0.1:27018` และ `server/node_modules` จาก `npm ci` ใช้ฐาน **`hotel_lobby_step9_test` เท่านั้น**; test helper ปฏิเสธ URL ที่ไม่ใช่ฐานทดสอบ และลบ/seed เฉพาะฐานนั้นจาก `docs/step2-sample-data.json`:

```powershell
cd server
npm ci
$env:DATABASE_URL='mongodb://127.0.0.1:27018/hotel_lobby_step9_test?replicaSet=rs0'
npx prisma validate
npx prisma db push
npm test
```

ตรวจรับวันที่ 7 ต.ค. 2026: `prisma validate` ผ่าน; `db push` สร้าง unique index `roomNightClaims_roomId_night_key` บนฐานทดสอบ; Jest 3 suites / 21 tests ผ่าน รวมวันผิด, วันติดกัน, ชุดตัวอย่าง Step 2, rollback ของ create/update, price snapshot, payment guard, cancel/rebook และคำขอคืนเดียวกันพร้อมกันที่สำเร็จเพียงหนึ่งรายการ ตรวจ claims หลังทดสอบแล้วไม่พบ claim ที่อ้าง booking หายหรือ cancelled. ไม่ได้ push schema ไป `hotel_lobby`; ก่อนเริ่มงาน instance MongoDB ที่ระบุใน README ไม่ทำงาน จึงตรวจข้อมูลเดิมไม่ได้ เมื่อเปิด production instance จริง ต้องตรวจข้อมูลและ index อีกครั้งก่อน `db push` ที่นั่น.

## งานถัดไป

- **Step 5:** ผูก auth/role middleware และส่ง `actorId` จาก session/JWT ที่ตรวจแล้วเท่านั้น ก่อนเพิ่ม write routes
- **Step 10:** ทำ Booking UI และ route สำหรับพนักงาน รวมการเลือก guest/room การแสดงข้อผิดพลาด และรายการจอง
- **Step 11:** ทำ check-in/out, การรับและคืนเงินจริงภายนอก พร้อม sync สถานะ Booking/Room/Payment ใน transaction; Step 9 บันทึกเพียง Payment summary เริ่มต้น
- **Step 12:** ทำ public availability API พร้อม rate limit/CORS และรูปแบบผลลัพธ์ที่ไม่เปิดเผยข้อมูลส่วนบุคคล
