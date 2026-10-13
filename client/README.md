# Hotel Lobby — Lub d Hotel Booking & Operations

เว็บภาษาไทยสำหรับผู้ดูแลระบบและพนักงานต้อนรับ ใช้ API ใน `server` ตาม contract ใน `docs/api-task12.md` ถึง `docs/api-task5.md`

หน้าแรก `/` ใช้ดีไซน์ [Lub d Moon ใน Figma](https://www.figma.com/design/rUkS1GaUOoVlF8aXu25gx0?node-id=0-1): พระจันทร์เลื่อนเข้าสู่หน้าโรงแรม ภาพต้นฉบับใน `public/figma`, ฟอร์มค้นหาห้องว่างและผลค้นหาจาก Public API. กดไอคอนพนักงานหรือเปิด `/#staff` เพื่อเข้าสู่ระบบ. บนมือถือแสดงแบบภาพเดียวและฟอร์มแนวตั้งตามเฟรม Mobile / home.

หน้าพนักงานใช้สีและองค์ประกอบเดียวกัน เพิ่มเมนูค้นหาห้องว่าง → เลือกห้อง → เลือกผู้เข้าพัก → ตรวจสอบ → ยืนยันผ่าน Booking API เดิม. รายงานใช้ยอด ledger ที่ API รองรับ จึงไม่แสดงกราฟรายวันหรือตัวกรองวันที่ที่ยังไม่มี endpoint. Public ค้นหาและแสดงรายละเอียดให้ติดต่อเคาน์เตอร์เท่านั้น ยังไม่สร้างการจองหรือรับชำระออนไลน์. ผลตรวจ UI และขอบเขตอยู่ใน [Figma implementation verification](../docs/figma-ui-verification.md).

## เริ่มใช้งานในเครื่อง

1. เตรียม MongoDB replica set และ API ตาม `README.md` ที่โฟลเดอร์หลัก โดยใช้ฐานทดลองแยกจากข้อมูลจริง
2. ตั้ง `server/.env` ให้ `CORS_ORIGINS` ตรงกับ origin ของเว็บ (ค่าเริ่มต้น `http://localhost:5173`)
3. ใน `server` รัน `npm ci` แล้ว `npm start`
4. ใน `client` รัน `npm ci` และ `npm run dev` แล้วเปิด `http://localhost:5173`

Vite proxy ส่ง `/api` ไป `http://localhost:3000` ระหว่างพัฒนา หาก deploy เว็บคนละ origin ให้ตั้ง `VITE_API_BASE_URL` เป็น URL ที่ลงท้ายด้วย `/api` ตอน build และเพิ่ม origin จริงใน `CORS_ORIGINS` ของ server. ไม่ต้องตั้งตัวแปรนี้เมื่อ deploy หลัง reverse proxy เดียวกัน

Token อยู่ในหน่วยความจำของแท็บเท่านั้น; รีเฟรชหน้าแล้วต้องเข้าสู่ระบบใหม่ตามนโยบาย session ของ API. งานรับ/คืนเงินต้องมีหลักฐานจริงและเลขอ้างอิง โดยฟอร์มส่ง `Idempotency-Key` เพื่อให้ส่งซ้ำด้วยข้อมูลเดิมได้เมื่อเครือข่ายขาด

## ตรวจโค้ด

## สมาชิกและการเคลื่อนไหว

เปิด `/#register` เพื่อสมัครสมาชิก หรือ `/#member` เพื่อเข้าสู่ระบบลูกค้า;
สมัครสำเร็จแล้วเข้าสู่บัญชีอัตโนมัติ แก้ไขชื่อ/อีเมลได้ หน้าโรงแรมและหน้าต่าง
ติดต่อแสดงชื่อและสถานะเข้าสู่ระบบ พร้อมปุ่มออกจากระบบ สิทธิ์ลูกค้าไม่สามารถ
เข้าถึง API ของพนักงานได้ Token ยังคงอยู่ในหน่วยความจำเท่านั้น

ตั้ง `VITE_CONTACT_PHONE`, `VITE_CONTACT_EMAIL`, `VITE_CONTACT_URL` เป็นช่องทาง
ที่โรงแรมยืนยันแล้วใน `.env` ก่อน build; URL ต้องเป็น HTTPS หากว่างจะแสดงว่า
ยังไม่มีช่องทางติดต่อ โดยไม่สร้างข้อมูลติดต่อหรือการจองขึ้นเอง

`src/motion.css` เพิ่ม feedback เมื่อกด/ชี้ปุ่ม และเอฟเฟกต์เปิดหน้า/หน้าต่าง;
`src/reveal.ts` เผยหัวข้อ ภาพ ฟอร์ม และผลค้นหาเมื่อเลื่อนถึงครั้งแรก
รองรับผลค้นหาที่เพิ่มภายหลัง คีย์บอร์ด การ cleanup และ `prefers-reduced-motion`.
หากเบราว์เซอร์ไม่มี IntersectionObserver เนื้อหาจะยังแสดงตามปกติ

## ตรวจโค้ดและพฤติกรรม

```powershell
npm run lint
npm run build
npm test
```

ฝั่ง server: `npm ci` จะ generate Prisma Client โดยอัตโนมัติ จากนั้นรัน `npm run test:all:isolated`. การทดสอบ staging, CORS origin จริง, mobile/keyboard กับข้อมูลและความจุจริง ยังต้องทำในสภาพแวดล้อม deployment ของทีมก่อนเปิดใช้งาน
