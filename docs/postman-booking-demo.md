# ยิง Booking API ตามภาพใน Postman

ฐานทดสอบ: `hotel_lobby_postman_demo` บน local replica set `postmanDemo` พอร์ต 27019

API: `http://127.0.0.1:3000` เปิดเฉพาะบนเครื่องนี้ ใช้ API / validation / transaction ของแอปเดิม ไม่มีการจำลอง response

## วิธีใช้

Import `docs/postman-booking-demo.postman_collection.json` ใน Postman แล้วกด Send ตามลำดับ:

1. **1 - Login**: บันทึก token ให้ collection อัตโนมัติ
2. **2 - Create booking**: ได้ `201 Created`, `confirmed`, `pricePerNight: 1200`, `totalPrice: 2400`

Request:

```http
POST http://127.0.0.1:3000/api/bookings
Content-Type: application/json
Authorization: Bearer <token จาก login>
```

```json
{
  "guestId": "400000000000000000000001",
  "roomId": "300000000000000000000001",
  "guestCount": 2,
  "checkInDate": "2026-11-10",
  "checkOutDate": "2026-11-12"
}
```

Login ใช้ `POST /api/auth/login`:

```json
{
  "email": "postman@hotel-demo.local",
  "password": "PostmanDemo!2026"
}
```

เป็นบัญชีพนักงานต้อนรับสำหรับ demo เท่านั้น Session มีอายุ 8 ชั่วโมง; login ใหม่ได้จาก request 1

Room `POSTMAN-101` และ Guest มีอยู่จริงในฐาน demo โดยใช้ ID ตรงกับภาพ RoomType รองรับ 2 คนและตั้งราคา 1,200 บาทต่อคืน Server คำนวณคืนพักและราคารวมเอง ไม่ต้องส่ง status หรือราคาใน request

หากกดสร้างซ้ำวันเดิม จะได้ 409 เพราะมี booking ที่ถือครองห้องคืนเดียวกันแล้ว ให้กด **4 - Cancel latest booking** ก่อนสร้างใหม่ หรือเปลี่ยนวันที่ การยกเลิกใช้ bookingId ของรายการล่าสุดที่สร้างสำเร็จใน collection

## เปิดบริการใหม่หลังปิดเครื่อง (สำหรับผู้ดูแล)

```powershell
cd server
node scripts/postman-booking-demo.cjs
```

สคริปต์เปิด MongoDB แยก, ตรวจ/สร้าง schema เฉพาะฐาน demo, เติมข้อมูลตัวอย่างแบบ upsert, แล้วเปิด API ไม่อ่าน DATABASE_URL จาก .env เพื่อเลือกฐานข้อมูล เก็บข้อมูลถาวรใน `server/.local-mongo/postman-demo` ไม่มีการล้างข้อมูลเมื่อเริ่มใหม่ ถ้าพอร์ต 3000 ถูกใช้โดยโปรเซสอื่น ต้องแก้ปัญหาพอร์ตก่อน

ตรวจจริงวันที่ 14 ตุลาคม 2026: readiness = ready; POST booking = 201 / confirmed / 1200 / 2400; GET booking ตรงกับรายการที่สร้าง; ยกเลิกรายการที่ใช้ทดสอบสำเร็จเพื่อเตรียมห้องให้ผู้ใช้ยิงเอง
