# Hotel Lobby — เว็บสำหรับพนักงาน

เว็บภาษาไทยสำหรับผู้ดูแลระบบและพนักงานต้อนรับ ใช้ API ใน `server` ตาม contract ใน `docs/api-task12.md` ถึง `docs/api-task5.md`

## เริ่มใช้งานในเครื่อง

1. เตรียม MongoDB replica set และ API ตาม `README.md` ที่โฟลเดอร์หลัก โดยใช้ฐานทดลองแยกจากข้อมูลจริง
2. ตั้ง `server/.env` ให้ `CORS_ORIGINS` ตรงกับ origin ของเว็บ (ค่าเริ่มต้น `http://localhost:5173`)
3. ใน `server` รัน `npm ci` แล้ว `npm start`
4. ใน `client` รัน `npm ci` และ `npm run dev` แล้วเปิด `http://localhost:5173`

Vite proxy ส่ง `/api` ไป `http://localhost:3000` ระหว่างพัฒนา หาก deploy เว็บคนละ origin ให้ตั้ง `VITE_API_BASE_URL` เป็น URL ที่ลงท้ายด้วย `/api` ตอน build และเพิ่ม origin จริงใน `CORS_ORIGINS` ของ server. ไม่ต้องตั้งตัวแปรนี้เมื่อ deploy หลัง reverse proxy เดียวกัน

Token อยู่ในหน่วยความจำของแท็บเท่านั้น; รีเฟรชหน้าแล้วต้องเข้าสู่ระบบใหม่ตามนโยบาย session ของ API. งานรับ/คืนเงินต้องมีหลักฐานจริงและเลขอ้างอิง โดยฟอร์มส่ง `Idempotency-Key` เพื่อให้ส่งซ้ำด้วยข้อมูลเดิมได้เมื่อเครือข่ายขาด

## ตรวจโค้ด

```powershell
npm run lint
npm run build
```

ฝั่ง server: `npm ci` จะ generate Prisma Client โดยอัตโนมัติ จากนั้นรัน `npm run test:all:isolated`. การทดสอบ staging, CORS origin จริง, mobile/keyboard กับข้อมูลและความจุจริง ยังต้องทำในสภาพแวดล้อม deployment ของทีมก่อนเปิดใช้งาน
