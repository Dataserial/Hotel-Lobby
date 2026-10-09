# ผลตรวจบัคและ workflow แก้ไข — 9 ตุลาคม 2026

## ขอบเขตและวิธีตรวจ

ตรวจ source ของ `client` และ `server`, อ่าน API contract ที่เกี่ยวข้อง และรันคำสั่งตรวจในเครื่องนี้ ผลด้านล่างแยก **ปัญหาที่ยืนยันจากโค้ด/การทดสอบ** ออกจาก **ความเสี่ยงที่ต้องวัดเพิ่ม** ไม่ได้ทดสอบกับฐานข้อมูลหรือ deployment จริงของโรงแรม

| การตรวจ | ผล |
| --- | --- |
| `client: npm run lint`, `npm run build` | ผ่าน แต่ build ได้หน้าเริ่มต้น Vite เท่านั้น |
| `server: npm run lint` | ผ่าน; script นี้ตรวจ syntax ไม่ใช่ lint เชิงคุณภาพ |
| `server: npm run test:task5` ครั้งแรก | ล้ม 7/7 เพราะ Prisma Client ที่มีอยู่ไม่ตรง schema (`paymentTransaction` เป็น `undefined`) |
| `server: npm run db:generate` แล้ว `npm run test:task5` | ผ่าน 7/7; จึงเป็นปัญหาขั้นตอนเตรียมเครื่อง/การรันทดสอบ ไม่ใช่หลักฐานว่า API Task 5 เสีย |
| `server: npm run test:all:isolated` | ผ่านทุกกลุ่ม (exit code 0); runner แยกบาง booking tests เป็นหลาย instance จึงมีตัวเลข skipped ระหว่างทางตามการเลือกกลุ่ม ไม่ใช่การข้าม test ในผลรวม |

## รายการปัญหาเรียงตามผลกระทบ

| รหัส / ระดับ | สิ่งที่พบและหลักฐาน | ผลต่อผู้ใช้ | แนวทางแก้และเกณฑ์ผ่าน |
| --- | --- | --- | --- |
| F1 / P0 | [`client/src/App.tsx`](../client/src/App.tsx) ยังแสดง `Get started`, ปุ่ม `Count is` และลิงก์ Vite/React; ไม่มีการเรียก API | พนักงานไม่สามารถล็อกอิน ดูห้อง/การจอง จัดการแขก รับชำระเงิน หรือ check-in/out ผ่านเว็บได้ | ออกแบบและสร้างหน้าสำหรับ flow หลักตาม API contract; ให้ทดสอบ flow ตั้งแต่ login ถึง logout ผ่าน UI ได้จริง |
| F2 / P1 | หน้าเว็บไม่มีการจัดการ session, role, loading/empty/error, และ conflict เพราะยังเป็น starter; backend มี endpoint แล้วใน [`server/app.js`](../server/app.js) | ผู้ใช้ไม่มีทางทราบว่างานกำลังโหลด สำเร็จ หรือถูกปฏิเสธ; การจองชนกันหรือ token หมดอายุยังไม่มีทางแก้จากหน้าจอ | ทำ API client, auth state, route guard, สถานะทุกหน้าจอ; เมื่อได้ 401 ให้กลับไป login, เมื่อจองได้ 409 ให้โหลดห้องว่างใหม่โดยคงข้อมูลที่กรอก |
| F3 / P1 | [`server/routes/api-room-types.js`](../server/routes/api-room-types.js) รับ `basePrice` ผ่าน `int(..., 0)` ซึ่งค่าเริ่มต้นยอมถึง `Number.MAX_SAFE_INTEGER` ใน [`server/lib/http.js`](../server/lib/http.js) แต่ Prisma field `basePrice Int` ใน [`server/prisma/schema.prisma`](../server/prisma/schema.prisma) จำกัดจำนวนเต็ม 32 บิต; ตัวตรวจรับค่า `2147483648` แล้ว | ค่าเกินช่วงของฐานข้อมูลหลุด validation และคำขอสร้าง/แก้ประเภทราคาอาจลงท้ายเป็น server error แทน 400 ที่แก้ฟอร์มได้ | ตั้งเพดานราคาให้สอดคล้อง schema และเพดานยอดรวม booking; เพิ่ม HTTP test สำหรับ `2147483647`, `2147483648` และราคาคูณจำนวนคืน; ค่าที่เกินต้องได้ 400 โดยไม่เขียนข้อมูล |
| F4 / P2 | [`server/package.json`](../server/package.json) ให้ `test:task5` รัน Jest ตรง แต่ต้อง generate Prisma Client ก่อน; เครื่องนี้ล้มครั้งแรกและผ่านหลัง `db:generate` | ผู้พัฒนา/CI อาจเข้าใจผิดว่าฟังก์ชันเสีย หรือรันทดสอบไม่ได้หลัง checkout/schema เปลี่ยน | ใส่ขั้น generate ใน setup/CI ที่บังคับใช้จริง หรือ `pretest` ที่เหมาะสม; ทดลองจาก `npm ci` ใหม่แล้ว test ต้องผ่านโดยไม่ต้องเดาลำดับคำสั่ง |
| F5 / P2 | [`client/index.html`](../client/index.html) ระบุ `lang="en"`, title `hotel-lobby`; UI และ [`client/README.md`](../client/README.md) ยังเป็นข้อความ template | ภาษา/ชื่อหน้าไม่บอกบริบทงานโรงแรม และ screen reader จะอ่านภาษาไทยผิดเมื่อใส่ UI ไทย | กำหนดภาษาหน้าและข้อความไทย/คำศัพท์โรงแรมให้สม่ำเสมอ; ตั้งชื่อหน้า/หัวข้อ และตรวจ keyboard, focus, label, mobile layout |

## ความเสี่ยงที่ยังไม่ใช่บัคที่ยืนยัน

| รหัส | หลักฐาน / สิ่งที่ต้องพิสูจน์ |
| --- | --- |
| R1 / ประสิทธิภาพ | [`server/services/availability-service.js`](../server/services/availability-service.js) โหลดห้องและ claims ทั้งชุด แล้ว [`server/routes/api-availability.js`](../server/routes/api-availability.js) ค่อย `slice` แบ่งหน้าใน memory; วัดเวลา/หน่วยความจำกับจำนวนห้องและ concurrent requests ตามขนาดที่คาดว่าจะใช้จริง แล้วออกแบบ query ให้แบ่งหน้า/นับ total อย่างถูกต้อง |
| R2 / การใช้งานหลาย instance | [`server/lib/security.js`](../server/lib/security.js) เก็บ rate limit ใน `Map` ต่อ process; วัดและกำหนด rate limit ที่ reverse proxy/shared store หาก deploy หลาย instance; ทดสอบ 429/`Retry-After` จากภายนอก |
| R3 / ความพร้อมใช้งาน | เอกสาร [`docs/task5-acceptance.md`](task5-acceptance.md) ระบุว่ายังไม่มีผล remote CI/deploy, frontend integration, migration rehearsal; ต้องทดสอบกับ staging และสำเนาข้อมูลจริงก่อนกล่าวว่าพร้อมใช้งานจริง |
| R4 / กติกาธุรกิจ | API อนุญาตวันที่ย้อนหลังที่ยังมีรูปแบบและช่วงคืนถูกต้อง แต่ check-in รับได้เฉพาะภายในวันจอง; ตกลงก่อนว่าต้องรองรับการบันทึกย้อนหลังหรือห้ามจองย้อนหลัง แล้วปรับ UI/API และ test ให้ตรงกัน |

## Workflow แก้ไข

1. **ล็อก baseline และข้อมูลทดสอบ** — ใช้ฐานทดสอบแยกตาม script เดิม, รัน `npm ci`, `npm run db:generate`, schema validate, lint และ test; เก็บผล CI ให้เทียบหลังแก้ ห้าม `db:push` ฐานที่มีข้อมูลจริงก่อน audit/backup ตาม README
2. **แก้ validation และ setup ก่อน** — แก้ F3, เพิ่ม boundary tests ระดับ HTTP; แก้ F4 ให้ติดตั้งใหม่แล้ว test ทำงานได้แน่นอน; ตรวจว่า test ทั้งชุดผ่าน
3. **สร้างแกน frontend** — สร้าง API client ที่ตั้ง base URL ได้, จัดการ Bearer token/expiry/logout และ role; ทำ layout ภาษาไทย responsive พร้อม loading/empty/error และ request ID เมื่อเกิดข้อผิดพลาด
4. **ทำ flow พนักงานตามลำดับใช้งาน** — login → dashboard → ค้นหาห้อง/จัดการแขก → เช็กห้องว่าง → สร้าง/แก้/ยกเลิก booking → รับ/คืนเงินพร้อมหลักฐานและ idempotency key → check-in/out → logout; แยกหน้าจอ admin สำหรับ users, room types, rooms และ report
5. **ทดสอบความผิดพลาดที่ผู้ใช้เจอบ่อย** — 401/403, วันที่ผิด, ความจุเกิน, ห้องถูกจองชน 409, จ่ายไม่ครบ, ส่งซ้ำ/เครือข่ายขาดช่วง, หน้าไม่มีข้อมูล; ทุกกรณีต้องมีข้อความและทางดำเนินการต่อโดยไม่ทำข้อมูลในฟอร์มหายโดยไม่จำเป็น
6. **ทดสอบ staging และข้อมูล** — รัน API/UI แบบ end-to-end ด้วย MongoDB replica set แยก; ตรวจ CORS ของ origin จริง, timezone Asia/Bangkok, keyboard/mobile, โหลดข้อมูลตามขนาดจริง, rate limit หลาย instance; audit/backup/rehearsal ก่อนแตะฐานเดิม
7. **เกณฑ์ปิดงาน** — lint/build/test ผ่านใน CI, flow หลักผ่านด้วย UI ทั้ง admin และ receptionist, ข้อผิดพลาดสำคัญมีทางแก้บนหน้าจอ, performance ผ่านเป้าหมายที่ทีมกำหนด, ไม่มี migration ที่ยังไม่ได้ซ้อมและไม่มีข้อมูลจริงเสียหาย
