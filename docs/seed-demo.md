# Demo seed

`server/scripts/seed-demo.js` เติมข้อมูลเฉพาะฐาน MongoDB บน `127.0.0.1` ที่ชื่อขึ้นต้นด้วย `hotel_lobby_` และลงท้ายด้วย `_demo` หรือ `_test` เช่น `hotel_lobby_task12_demo` เท่านั้น ไม่ใช้กับฐาน production

## ข้อมูลผู้ใช้

seed ที่ใช้งานจริงสร้าง **Demo Admin 1 บัญชี** (role `admin`, active) โดยใช้อีเมลและรหัสผ่านจาก `DEMO_ADMIN_EMAIL` กับ `DEMO_ADMIN_PASSWORD` รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษรและเก็บเป็น bcrypt hash ไม่มีรหัสผ่านเริ่มต้นใน repository หากมีบัญชีอีเมลนี้อยู่แล้ว seed จะตรวจ role, สถานะ และรหัสผ่านก่อนทำงาน และไม่เปลี่ยนรหัสผ่านเดิม

ไฟล์ `docs/step2-sample-data.json` เป็น fixture ออกแบบและทดสอบ มีตัวอย่าง `Demo Admin` และ `Demo Receptionist` แต่ `passwordHash` ในไฟล์เป็น placeholder จึง **ไม่ใช่บัญชีที่ seed-demo สร้าง** หากต้องการบัญชี receptionist ในฐาน demo ให้ admin เพิ่มผ่านหน้า “ผู้ใช้” หรือ `POST /api/users`

## ประเภทและห้องพัก

| ประเภท | ความจุ | ราคา/คืน | ห้อง | ชั้น |
| --- | ---: | ---: | --- | ---: |
| Demo Standard | 2 คน | ฿1,200 | DEMO-101, DEMO-102, DEMO-103 | 1 |
| Demo Deluxe | 2 คน | ฿1,800 | DEMO-201, DEMO-202, DEMO-203 | 2 |
| Demo Family | 4 คน | ฿2,600 | DEMO-301, DEMO-302, DEMO-303 | 3 |

ทุกห้องเริ่มเป็น `available` และ `active` seed ไม่สร้างผู้เข้าพัก การจอง หรือการชำระเงิน การรันซ้ำจะเพิ่มเฉพาะรายการที่ขาด โดยไม่ทับราคา สถานะห้อง หรือข้อมูลที่แก้ไว้แล้ว

## วิธีใช้

เตรียม MongoDB replica set และตั้ง `DATABASE_URL` ไปฐาน demo แยกก่อน จากโฟลเดอร์ `server`:

```powershell
$env:DATABASE_URL='mongodb://127.0.0.1:27018/hotel_lobby_task12_demo?replicaSet=rs0'
$env:DEMO_ADMIN_EMAIL='admin@example.test'
$env:DEMO_ADMIN_PASSWORD='<รหัสผ่านทดลองอย่างน้อย 12 ตัวอักษร>'
npm run db:push
npm run db:seed:demo
npm run test:seed:demo
```

`db:push` ใช้กับฐาน demo ที่ตั้งใจสร้าง/ปรับ schema แล้วเท่านั้น ชุดทดสอบ `test:seed:demo` เปิด replica set ชั่วคราวและใช้ฐานทดสอบแยกจาก demo
