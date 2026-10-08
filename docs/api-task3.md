# Task 3 — Staff Booking API

Task 4 ต่อจาก contract นี้: update/cancel จะคืน `409 PAYMENT_RECONCILIATION_REQUIRED` เมื่อ ledger ยังไม่ยืนยัน หรือ `PAYMENT_INCONSISTENT` เมื่อรายการกับ summary ไม่ตรงกัน. รับ/คืนเงินผ่าน [Task 4 API](api-task4.md) เท่านั้น; cancellation หลังคืนครบปรับ payment status พร้อมกัน. Booking create ยังไม่มี idempotency key; key ของ Task 4 ใช้เฉพาะ monetary operations.

ต่อจาก [Task 1–2 contract](api-task12.md); OpenAPI: [openapi-task3.yaml](openapi-task3.yaml). ทุก endpoint ด้านล่างต้องใช้ Bearer session ของ **admin หรือ receptionist** และอยู่หลัง `requireAuth` ในแอปเดียวกัน ไม่มี public availability ใน Task 3.

## Routes

| Endpoint | Input | Response |
|---|---|---|
| `GET /api/rooms/availability` | ต้องมี `checkInDate`, `checkOutDate`, `guestCount`; เพิ่ม `page`, `limit` ได้ | 200 `{items,page,limit,total}` |
| `GET /api/bookings` | `status`, `guestId`, `roomId`, `checkInFrom`, `checkInTo`, `page`, `limit` | 200 `{items,page,limit,total}` |
| `GET /api/bookings/:id` | ObjectId; ไม่รับ query | 200 Booking หรือ 404 `BOOKING_NOT_FOUND` |
| `POST /api/bookings` | `guestId`, `roomId`, `guestCount`, `checkInDate`, `checkOutDate` ครบทุกฟิลด์ | 201 Booking |
| `PATCH /api/bookings/:id` | บางส่วนของห้าฟิลด์ข้างบน อย่างน้อยหนึ่งฟิลด์ | 200 Booking |
| `POST /api/bookings/:id/cancel` | body ว่างหรือ `{}`; ไม่รับ query | 200 Booking สถานะ `cancelled` |

List ใช้ page 1, limit 20 เป็นค่าเริ่มต้น สูงสุด 100; booking เรียง `createdAt desc, id desc`. ตัวกรองวันเป็น **วันเข้า** แบบ inclusive ทั้งสองด้าน ไม่ใช่การหา overlap และไม่จำกัด filter เป็น 365 วัน; ใช้ตัว parser วันเดิมตรวจแต่ละขอบเขต. ปฏิเสธ unknown body/query fields. Write routes ไม่รับ query.

Availability เรียก service เดิมและแบ่งหน้าหลังกรองครบ จึงได้ total ของห้องว่างจริง; response มีเฉพาะ `roomId,roomNumber,roomType,capacity,pricePerNight`. กรองห้อง/ประเภทที่ active, capacity เพียงพอ, ห้อง status `available` และไม่มี claims ของคืนที่ค้น. ห้อง occupied/maintenance ถูกตัดออกแม้ค้นวันอนาคต. ขณะนี้ service อ่าน candidates ทั้งชุดก่อนกรองและ pagination; ปริมาณ response ถูกจำกัด แต่ยังไม่ได้ทำ database pagination.

Booking response ใช้ allowlist: `id,guestId,roomId,guestCount,checkInDate,checkOutDate,status,pricePerNight,totalPrice,actualCheckInAt,actualCheckOutAt,cancelledAt,createdAt,updatedAt,createdById,updatedById`. ไม่มี guest document, user/session relation, claims หรือ payment records แนบมา; UI ใช้ guest/room APIs เดิมเมื่อจำเป็น.

## Booking rules และ actor

- วันที่ `YYYY-MM-DD` ต้องมีอยู่จริง ช่วง `[checkInDate,checkOutDate)` 1–365 คืน; วันออกจองต่อได้. Guest count จำนวนเต็ม 1–20 และไม่เกิน capacity. ราคาเป็นจำนวนเต็มบาทจาก server.
- `createdById`/`updatedById` มาจาก `req.actor.id` ของ session ที่ตรวจแล้วเท่านั้น. Body/query ที่มี `actorId`, audit fields, status หรือราคา ถูกปฏิเสธ. Header เช่น `actorId`/`X-Actor-Id` ไม่มีผลต่อ identity.
- Create สร้าง confirmed Booking, claims ทุกคืน และ Payment summary ใน transaction เดียวกัน. ราคาถูกบันทึกเป็น snapshot.
- แก้ guest/จำนวนคน หรือส่งวัน/ห้องค่าเดิม คง snapshot. เมื่อวันหรือห้องเปลี่ยนจริง คำนวณราคาทั้ง stay จาก basePrice ปัจจุบัน พร้อมแทน claims และปรับ Payment summary ใน transaction เดียวกัน.
- แก้และยกเลิกได้เฉพาะ confirmed. หากรับเงินสุทธิแล้ว ห้ามแก้จน total เปลี่ยน และห้าม cancel จนคืนเงินและบันทึกยอดคืนครบ. Task นี้ไม่มี endpoint รับ/คืนเงินจริง.
- Cancel เก็บ Booking/Payment เดิม เปลี่ยน status, cancelledAt และ updatedById พร้อมลบ claims. Claims ของ confirmed/checked_in/checked_out คงคืนเดิมตามแบบข้อมูล.

ผล availability ใช้ให้พนักงานเลือกห้อง; ระหว่างค้นกับยืนยันมีผู้อื่นจองได้เสมอ. Unique `(roomId,night)` กับ transaction เป็นตัวรับประกันการจอง. UI ต้องรับ 409 แล้วโหลด availability ใหม่.

## Errors และ concurrency

รูปแบบเดิม `{error:{code,message,requestId}}`; ทุก response มี `X-Request-Id`. Validation 400, session ใช้ไม่ได้ 401, role ไม่พอ/actor ใช้ไม่ได้ 403, reference หาย 404 และ conflict 409.

| HTTP | Codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_REFERENCE`, `INVALID_DATE_RANGE`, `INVALID_GUEST_COUNT`, `CAPACITY_EXCEEDED`, `INVALID_PRICE` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN`, `INVALID_ACTOR` |
| 404 | `BOOKING_NOT_FOUND`, `GUEST_NOT_FOUND`, `ROOM_NOT_FOUND` |
| 409 | `ROOM_UNAVAILABLE`, `INVALID_TRANSITION`, `PAYMENT_ADJUSTMENT_REQUIRED`, `PAYMENT_REFUND_REQUIRED`, `WRITE_CONFLICT` |

`P2002` จากการ insert claims แปลงเป็น `ROOM_UNAVAILABLE`; unique errors ของ Booking/Payment ไม่ถูกแปลเป็นห้องไม่ว่าง. `P2034` retry **ทั้ง transaction** ไม่เกิน 3 attempts โดยอ่าน actor/booking/room/payment ใหม่ทุกครั้ง; หมดแล้วคืน `WRITE_CONFLICT`. ไม่มี retry สำหรับ validation, transition, payment guard หรือ unique claim conflict. HTTP handler ไม่ retry ซ้ำอีกชั้น. API ยังไม่มี idempotency key; การส่ง POST ใหม่หลังขาดการเชื่อมต่อควรตรวจรายการจองก่อน.

ตัวอย่าง request (ใช้ Bearer token ตาม Task 1–2):

```http
POST /api/bookings
Authorization: Bearer <token>
Content-Type: application/json

{"guestId":"400000000000000000000001","roomId":"300000000000000000000001","guestCount":2,"checkInDate":"2026-11-10","checkOutDate":"2026-11-12"}
```

ถ้า room type ราคา 1200 บาท response 201 มี `pricePerNight:1200,totalPrice:2400,status:"confirmed"`. เมื่อคืนชน จะได้ 409 เช่น:

```json
{"error":{"code":"ROOM_UNAVAILABLE","message":"The room was booked for one of these nights.","requestId":"<UUID>"}}
```

## Claims audit/backfill ก่อนเปิดฐานเดิม

ใช้ `npm run db:claims -- --database <ชื่อฐานที่ตรง DATABASE_URL>` เป็น read-only audit. Exit 0 เมื่อสะอาด; exit 1 เมื่อมี missing claims/issues หรือคำสั่งล้มเหลว. Output ระบุเฉพาะชื่อฐานและ IDs/คืนที่ต้องตรวจ ไม่พิมพ์ connection URL/credentials. ต้องมี schema/collections ก่อนรัน.

ตรวจ index จริงของ claims, วันพัก, room/type/guest/actor references, คืนที่ booking ชนกัน, missing/extra/orphan/cancelled claims และ orphan payments. Audit ไม่ใช่เครื่องมือตรวจคุณภาพข้อมูลทั้งหมดหรือการย้าย schema.

ก่อน apply ต้องหยุด booking writes, ยืนยัน target, สำรองข้อมูลและทดลองกับสำเนาก่อน แล้วใช้:

```powershell
npm run db:claims -- --database <ชื่อฐาน> --apply --writes-stopped --backup-confirmed --copy-tested
```

Flags เป็นการยืนยันของผู้ปฏิบัติงาน เครื่องมือไม่ได้หยุด traffic หรือสร้าง backup ให้. Apply เติมเฉพาะ claims ที่ขาด ใช้ `validateStay` เดิมและ transaction ต่อ booking รันซ้ำได้; ไม่แก้ Booking/Payment, ไม่ลบ claims และไม่เลือกผู้ชนะเมื่อข้อมูลชน. หาก audit มี issue หรือ index ไม่พร้อมจะหยุดก่อนเติม. หลังเติม audit ซ้ำต้องสะอาดก่อนเปิด writes.

งานหลาย booking ไม่เป็น transaction เดียว หากล้มเหลวกลางทาง booking ก่อนหน้าอาจเติมสำเร็จแล้ว; ให้คงการหยุด writes ตรวจผล แล้วแก้สาเหตุและรันซ้ำ หรือ restore backup ตามแผนที่ทดลองไว้. ไม่มีการ apply/backfill หรือ push schema ไปฐาน production ในการตรวจรับ Task 3.

## Test acceptance

```powershell
cd server
npm ci
npm run db:generate
$env:MONGOD_PATH='C:/Program Files/MongoDB/Server/7.0/bin/mongod.exe' # หรือ binary ที่ติดตั้งในเครื่อง
npm run test:all:isolated
```

Runner เปิด replica sets ชั่วคราวและใช้เฉพาะ `hotel_lobby_step9_test`, `hotel_lobby_task12_test`, `hotel_lobby_task3_test`; ไม่ใช้ `DATABASE_URL` จริงเป็นฐาน tests. รายงานผลและข้อจำกัดที่ [task3-acceptance.md](task3-acceptance.md).
