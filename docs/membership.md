# บัญชีสมาชิกและหน้าแรก

## เส้นทางเว็บ

| URL | หน้า |
| --- | --- |
| `/` หรือ `/#home` | แนะนำโรงแรม สรุปห้อง ราคา วิธีใช้ และ FAQ |
| `/#discover` | ค้นหาห้องพักตามวันและจำนวนคน |
| `/#register` | สมัครบัญชีลูกค้า |
| `/#member` | เข้าสู่ระบบลูกค้า / แก้ชื่อและอีเมล |
| `/#staff` | เข้าสู่ระบบ / ระบบพนักงาน |

โลโก้ทุก navbar กลับหน้าแรกโดยไม่ออกจากระบบ Token เก็บในหน่วยความจำของ
แท็บเท่านั้น รีเฟรชแล้วต้อง login ใหม่ การค้นหาและติดต่อพนักงานยังไม่สร้าง
การจองหรือรับชำระออนไลน์

## API สมาชิก

| Endpoint | สิทธิ์ / ข้อมูล |
| --- | --- |
| `POST /api/auth/register` | Public; รับ `name,email,password` เท่านั้น, 201 `{user}`; server กำหนด role `customer` |
| `POST /api/auth/login` | `email,password`; 200 `{token,tokenType,expiresIn,user}` อายุ 8 ชั่วโมง |
| `GET /api/auth/me` | Bearer session ทุก role; 200 `{user}` |
| `PATCH /api/auth/profile` | customer; `name,email` อย่างน้อยหนึ่งฟิลด์; 200 `{user}` |
| `POST /api/auth/logout` | Bearer session ทุก role; 204 และเพิกถอน session |

รหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร ไม่เกิน 72 ไบต์ UTF-8 ไม่ตัดช่องว่าง
Login รองรับรหัสเก่าที่สั้นกว่าแต่ไม่รับเกินขีดจำกัด bcrypt การเปลี่ยนรหัสผ่าน
ผ่านผู้ดูแลจะเพิกถอน sessions ของบัญชีนั้น อีเมลซ้ำคืน 409 ลูกค้าเข้าถึง
API ผู้เข้าพัก การจอง ห้องพัก การเงิน และผู้ใช้ของพนักงานไม่ได้

## API สรุปหน้าแรก

`GET /api/public/overview` ไม่ต้อง login ไม่รับ query มี rate limit และ
`Cache-Control: no-store` ใช้ transaction และกฎ availability เดียวกับการจอง

ผลลัพธ์มี `date,checkOutDate,timezone,updatedAt,totalRooms,availableRooms,
bookedRooms,roomTypes`:

- ช่วงเวลาคือคืนนี้ `[date,checkOutDate)` ตาม Asia/Bangkok
- `totalRooms`: ห้อง active ที่อ้างอิงประเภท active รวม maintenance
- `availableRooms`: จองได้คืนนี้สำหรับผู้พักอย่างน้อย 1 คน หลังตรวจ claims
- `bookedRooms`: confirmed/checked_in ที่ครอบคลุมคืนนี้ของ inventory นี้
- `roomTypes`: ประเภท active ที่มีห้อง active; มี `id,name,capacity,
  pricePerNight,amenities,totalRooms,availableRooms`
- ไม่มีชื่อผู้เข้าพัก เอกสาร ID การจอง รายการชำระเงิน หรือ credentials

ราคาเป็นราคาปัจจุบันต่อห้องต่อคืน ไม่ใช่ snapshot ของ booking เก่า
ห้องว่างไม่รวม maintenance หรือห้องไม่พร้อม จึงไม่ควรคาดว่า available +
booked เท่ากับ total เสมอ กดอัปเดตข้อมูลเพื่ออ่านใหม่; มีเวลาที่อ่านล่าสุด
ไม่ใช่ข้อมูล realtime แบบ push

## ตั้งค่าและทดสอบ

ใช้ `client/.env.example` ตั้ง API และช่องทางติดต่อจริงก่อน build ค่า contact
ว่างแสดง unavailable โดยไม่สร้างข้อมูลขึ้นเอง ฐาน local demo ไม่ใช่ฐานจริง
วิธีตั้ง first admin บน empty staging อยู่ใน [deployment guide](deploy-vercel-render-atlas.md)

```powershell
cd client
npm test
npm run lint
npm run build
cd ../server
npm run lint
npx prisma validate
npm run test:all:isolated
```

ชุด homepage ใช้ React DOM, HTTP และ MongoDB replica set ชั่วคราวทดสอบ `/`,
ราคาและจำนวนห้องจริง, โลโก้จาก hotel/login/member/staff กลับหน้าแรกโดย session
ยังอยู่ Backend ตรวจการจองที่ลด inventory, เปลี่ยนราคา/maintenance, ฐานว่าง
และการไม่เปิดเผยข้อมูลส่วนบุคคล
