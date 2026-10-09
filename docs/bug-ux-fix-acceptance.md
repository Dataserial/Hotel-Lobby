# ผลแก้ F1–F5 — 9 ตุลาคม 2026

## งานที่ทำ

- F1/F2: แทนหน้า Vite starter ด้วยเว็บพนักงานภาษาไทย เชื่อม API จริงสำหรับ login/logout, dashboard, แขก, ห้อง, ประเภทห้อง, ผู้ใช้, availability, booking, รับ/คืนเงิน, check-in/out และรายงานตาม role
- F2: เก็บ Bearer token ในหน่วยความจำ, ตั้งเวลาหมดอายุ, กลับหน้า login เมื่อ 401, แสดง error พร้อม request ID, สถานะโหลด/ว่าง และเมื่อจองชนให้ค้นหาห้องใหม่โดยคงฟอร์ม
- F3: จำกัด `basePrice` ที่ 2,147,483,647 บาททั้ง create/patch; เพิ่ม HTTP tests สำหรับค่าขอบเขตและยอดจองสองคืนที่เกิน Prisma Int
- F4: `server/npm ci` เรียก `prisma generate` ผ่าน `postinstall`
- F5: ตั้ง `lang="th"`, title ไทย, responsive layout, label ฟอร์ม, focus/Tab/Escape ใน dialog และคู่มือ client

## หลักฐานตรวจ

| ตรวจ | ผล |
| --- | --- |
| `client/npm ci`, lint, build | ผ่าน |
| `server/npm ci` จากการติดตั้งใหม่ | ผ่านและ generate Prisma Client |
| `server/npx prisma validate` กับ URL ฐาน test | ผ่าน |
| `server/npm run lint` | ผ่าน |
| `server/npm run test:task5` | ผ่าน 7/7 |
| `server/npm run test:all:isolated` | ผ่านทุกกลุ่ม รวม HTTP boundary tests ใหม่ |
| UI กับ MongoDB replica set ชั่วคราว | admin login → สร้าง booking → รับเงิน → check-in → check-out → report → logout ผ่าน; receptionist login แล้วเห็นเฉพาะเมนูตามสิทธิ์ |

การทดสอบ UI ใช้ฐาน `hotel_lobby_ui_smoke_test` ใน MongoDB ชั่วคราวและข้อมูลจำลองเท่านั้น ไม่ใช้ฐานโรงแรมจริง สภาพแวดล้อมนี้ถูกปิดหลังตรวจ

## สิ่งที่ยังต้องทำก่อนใช้งานจริง

ยังไม่มี staging/deployment origin ของโรงแรมและขนาดข้อมูลเป้าหมาย จึงยังไม่สามารถยืนยัน CORS origin จริง, ประสิทธิภาพ inventory ขนาดจริง, rate limit หลาย instance, migration rehearsal และ backup/restore ของฐานเดิมได้ ให้ทำขั้นตอนที่ 6–7 ใน `bug-ux-fix-workflow.md` บน staging ก่อนเปิด production
