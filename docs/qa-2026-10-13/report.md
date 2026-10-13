# รายงานตรวจ Hotel-Lobby — 13 ตุลาคม 2026

ตรวจจาก commit `7a7a777` ใน `C:/Users/Administrator/Desktop/Hotel-Lobby`

## สรุป

พบ **17 ประเด็น**: ข้อบกพร่อง/ความไม่สอดคล้องที่ยืนยันได้ 14 ข้อ, ความเสี่ยงเมื่อ deploy หลัง proxy 1 ข้อ, ข้อจำกัดกติกาห้องว่าง 1 ข้อ และงานเพิ่มความทนทานเครือข่าย 1 ข้อ

| ความสำคัญ | จำนวน | ความหมาย |
| --- | ---: | --- |
| Critical | 0 | ไม่พบจากขอบเขตที่ตรวจ ไม่ใช่การรับรองว่าไม่มี |
| High | 8 | ควรแก้หรือปิดประเด็นก่อนใช้งานจริง |
| Medium | 7 | ทำให้ flow ล้มเหลว/ข้อมูลผิด/ใช้งานยาก |
| Low | 2 | ข้อมูลค่าเริ่มต้นและเอกสาร |
| รวม | 17 | รวมความเสี่ยงและข้อจำกัดที่แยกประเภทไว้ |

**ข้อสรุป:** โค้ด build ได้และชุดทดสอบเดิมผ่าน แต่ยังมีช่องว่างใน auth, การจัดลำดับ request และ booking workflow ไม่ควรใช้ผล tests เดิมเพียงอย่างเดียวตัดสินว่า production พร้อมแล้ว

ไม่มีการแก้โค้ดแอป ไม่มีการ deploy ไม่ใช้ฐานโรงแรมจริง ไม่อ่านหรือเผยแพร่ secrets ทดสอบ HTTP ผ่านเซิร์ฟเวอร์ localhost และ MongoDB replica set ชั่วคราวที่สร้างใหม่และปิดหลังตรวจ บัญชี/ข้อมูลทั้งหมดใน probe เป็น fixture

## ผลรันจริง

| การตรวจ | ผล |
| --- | --- |
| `client: npm run lint` | ผ่าน |
| `client: npm test` | ผ่าน 5/5 |
| `client: npm run build` | ผ่าน TypeScript และ Vite |
| `client: npm audit --json` | registry รายงาน 0 vulnerabilities |
| `server: npm run lint` | ผ่าน แต่ script ตรวจ syntax ไม่ใช่ semantic lint/security review |
| `server: npx prisma validate` | ครั้งแรก P1012 เพราะไม่มี DATABASE_URL; ผ่านเมื่อใส่ URL local test เฉพาะ process ไม่เชื่อม/แก้ฐาน |
| `server: npm run test:all:isolated` | exit 0 ทุกกลุ่มที่ runner เรียกผ่าน; tests ที่แบ่งด้วย pattern ถูก skip ในกลุ่มอื่นโดยตั้งใจ |
| `server: npm audit --json` | registry รายงาน 0 vulnerabilities |
| probes เพิ่มเติม | รันสำเร็จ; รายละเอียดจริงใน `evidence.json` |
| Browser UI / screenshots | **ยังไม่ได้ตรวจ**: browser inventory ว่างและ Chrome unavailable |

`npm audit` ไม่ครอบคลุมบั๊กในโค้ดแอป ไม่ใช่หลักฐานว่าระบบปลอดภัยทั้งหมด

## ตารางประเด็น

| ID | ระดับ | ประเภท/สถานะ | ปัญหา | หลักฐานโค้ด |
| --- | --- | --- | --- | --- |
| A01 | High | Security / ยืนยัน HTTP | รหัสผ่านต่างกันหลัง 72 bytes ยังเข้าได้ | `server/routes/api-users.js:7`, `api-auth.js:12` |
| A02 | Medium | Functional / ยืนยัน HTTP | สร้างรหัสผ่านมีช่องว่างหัวท้ายได้ แต่ login ไม่ได้ | `server/routes/api-auth.js:12`, `api-users.js:7` |
| A03 | High | Security / ยืนยัน HTTP | เปลี่ยนรหัสผ่านแล้ว token เก่ายังใช้งานได้ | `server/routes/api-users.js:47`, `server/lib/auth.js:11` |
| A04 | High | Deployment risk / proxy simulation | rate limit รวมผู้ใช้หลัง proxy และ HTTPS header ไม่ถูกตีความ | `server/app.js:7`, `server/lib/security.js:9` |
| A05 | High | Functional / component handler | เปิดรายละเอียด A แล้ว B แต่ response A กลับช้าทับ B | `client/src/App.tsx:156` |
| A06 | Medium | Functional / hook execution | เปลี่ยนหน้า/ตัวกรองแล้วคำตอบเก่าทับข้อมูลใหม่ | `client/src/App.tsx:41` |
| A07 | High | Business limitation / ยืนยัน HTTP | ห้อง occupied วันนี้จองอนาคตหลังวันออกไม่ได้ | `availability-service.js:8`, `booking-service.js:32` |
| A08 | High | Functional / HTTP + code trace | แก้วัน/จำนวนคนของ booking เดิมแล้วเลือกห้องเดิมไม่ได้ | `client/src/App.tsx:157`, `availability-service.js:18` |
| A09 | High | Functional / handler + code | โหลด lookup/list/history เพียง 100 รายการ | `client/src/App.tsx:88`, `155`, `156`, `182`, `189`, `198` |
| A10 | Medium | Functional / handler + HTTP | แก้เลขห้อง/ชั้นของห้อง occupied ถูก backend ปฏิเสธ | `client/src/App.tsx:184`, `server/routes/api-rooms.js:52` |
| A11 | Low | Functional / handler execution | ชั้น 0 เปลี่ยนเป็น 1 เมื่อเปิดแก้ไข | `client/src/App.tsx:183` |
| A12 | High | UX / component output + code | ปุ่มติดต่อพนักงานไม่มีช่องทางติดต่อจริง | `client/src/PublicHotel.tsx:81` |
| A13 | Medium | Functional / API helper execution | HTTP 200 ที่ไม่ใช่ JSON ถูกถือว่าสำเร็จและคืน null | `client/src/api.ts:33` |
| A14 | Medium | Resilience improvement / code + options | fetch ไม่มี timeout/cancellation | `client/src/api.ts:29` |
| A15 | Medium | Accessibility / คำนวณจาก CSS | สีข้อความรอง contrast ต่ำกว่าเกณฑ์ข้อความเล็ก | `client/src/index.css:2`, `App.css:25`, `45` |
| A16 | Low | Documentation / function execution | คู่มือบอก seed Atlas แต่ seed ปฏิเสธ Atlas | `docs/deploy-vercel-render-atlas.md:24`, `server/scripts/seed-demo.js:14` |
| A17 | Medium | UX / component + code | ปุ่มดูการจองจาก dashboard ไม่เปิดรายการที่กด | `client/src/App.tsx:95` |

## รายละเอียดและวิธีทำซ้ำ

### A01 — bcrypt ตัดรหัสผ่านโดยไม่มี validation

- URL: `POST /api/users`, `POST /api/auth/login`
- สร้างผู้ใช้ด้วยรหัสผ่าน ASCII prefix 72 ตัวตามด้วย `A` แล้ว login ด้วย prefix เดิมตามด้วย `B`
- จริง: create **201**, login ด้วยรหัสต่างกัน **200**; `bcrypt.truncates` เป็น true
- คาดหวัง: รหัสต่างกันเข้าไม่ได้ หรือ reject รหัสที่เกินนโยบายก่อน hash
- สาเหตุ: validation ใช้ความยาวตัวอักษร 12–128 แต่ bcrypt รองรับข้อมูลเพียง 72 bytes; ภาษาไทยยิ่งถึงขีดจำกัดเร็วกว่า ASCII ตาม [เอกสาร bcryptjs](https://github.com/dcodeIO/bcrypt.js/)
- แนวทาง: นโยบายรหัสผ่านรวมที่ใช้ทั้ง create/update/login/seed; จำกัด UTF-8 bytes หรือออกแบบ migration hashing อย่างชัดเจน ห้ามเปลี่ยน hash ของบัญชีเดิมโดยไม่มี migration
- หลักฐาน: `password-truncation`

### A02 — normalize password ไม่สอดคล้องกัน

- URL: users/login เช่น A01
- สร้างรหัสผ่าน fixture ที่มี space หัวท้าย แล้ว login ด้วยค่าตรงตัว
- จริง: create **201**, login **401 INVALID_CREDENTIALS**
- สาเหตุ: create/update hash string เดิม แต่ login เรียก `str()` ซึ่ง trim
- คาดหวัง: preserve รหัสผ่านตรงตัว หรือ reject ชัดเจนตั้งแต่ตั้งรหัส ห้าม trim ฝั่งหนึ่งเท่านั้น
- หลักฐาน: `password-whitespace`

### A03 — session ไม่ถูกถอนเมื่อเปลี่ยนรหัสผ่าน

- URL: `PATCH /api/users/:id`, `GET /api/auth/me`
- login → เปลี่ยน password → เรียก `/me` ด้วย token เดิม
- จริง: PATCH **200**, token เดิม `/me` **200**, session เดิมยังมีอยู่
- ผลกระทบ: การเปลี่ยนรหัสไม่ตัด token ที่อาจรั่ว อายุ session ตั้งไว้ 8 ชั่วโมง
- แนวทาง: ถอน session ของบัญชีเมื่อเปลี่ยน credential ใน transaction เดียวกัน กำหนดชัดว่าบัญชีตัวเองต้อง login ใหม่ และอย่าเพิ่มการเก็บ token ถาวรใน browser
- หลักฐาน: `password-session-revocation`

### A04 — trust proxy ไม่รองรับ deployment ที่วางแผน

- URL: auth/login, health; เป็น **การจำลอง reverse proxy** ไม่ใช่ผล Render production
- ส่ง 21 login requests จาก loopback พร้อม forwarded IP ต่างกัน 21 ค่า
- จริง: request สุดท้าย **429** เพราะ `req.ip` ยังเป็น socket address; `trust proxy=false`; forwarded HTTPS ไม่สร้าง HSTS ในแอป
- ผลกระทบแบบมีเงื่อนไข: ถ้า proxy ใช้ socket IP ร่วมกัน ผู้ใช้จริงอาจแชร์ quota 20 ครั้ง/15 นาที ไม่ได้พิสูจน์ว่า Render จริงมี topology นี้
- แนวทาง: ตรวจ topology staging แล้วกำหนด trusted proxy แบบจำกัดขอบเขต ห้ามแก้ด้วย `trust proxy=true` แบบเชื่อทุกแหล่ง เพิ่ม tests กัน spoof X-Forwarded-For และพิจารณา shared limiter เมื่อหลาย instance
- พฤติกรรมนี้สอดคล้องกับ [คู่มือ Express behind proxies](https://expressjs.com/en/guide/behind-proxies/)
- หลักฐาน: `proxy-config`, `proxy-shared-rate-limit`

### A05 — รายละเอียดจองเก่าทับรายการใหม่

- พื้นที่: `#staff` → การจอง → รายละเอียด
- เรียก detail A แล้ว B ทำให้ B กลับก่อน แล้วปล่อย A กลับ
- จริง: modal แรก `#NEW002` เปลี่ยนเป็น `#OLD001`
- ผลกระทบ: พนักงานอาจดำเนินการกับรายการที่ไม่ใช่รายการล่าสุดที่เลือก; handler จริงถูก execute แต่ยังไม่ได้ทำซ้ำด้วย browser
- สาเหตุ: detail Promise.all ไม่มี generation/selection guard และไม่มี loading lock
- แนวทาง: guard ทั้ง booking/payment/transactions ให้เป็น selection เดียวกัน ปิด/เปลี่ยนแท็บ/ออกจากระบบต้อง invalidate request และห้าม response ล่าช้าเปิด modal กลับมา
- หลักฐาน: `booking-detail-race`

### A06 — useList ไม่กัน stale response

- พื้นที่: lists แขก/ห้อง/การจอง/ประเภท/ผู้ใช้
- โหลด page 1 แล้ว page 2 ให้ page 2 สำเร็จก่อน page 1
- จริง: state แรก `page2`, สุดท้ายกลับเป็น `page1` ทั้งที่ current path เป็น page 2
- สาเหตุ: hook ตั้ง data/error/loading โดยไม่มี request version หรือ cancellation
- แนวทาง: latest-request-wins และ cleanup จริง; error/loading ของ request เก่าต้องไม่เปลี่ยน state ใหม่
- หลักฐาน: `list-race`

### A07 — สถานะห้องปัจจุบันตัดสินห้องว่างทุกวัน

- URL: public availability และ create booking
- fixture เข้าพัก 13–14 ต.ค.; check-in สำเร็จ; ค้น/จอง 16–17 ต.ค.
- จริง: search **200** แต่ห้องไม่อยู่ในผล; create **409 ROOM_UNAVAILABLE** แม้ claims ของสองช่วงไม่ชน
- สาเหตุ: ทั้ง search และ bookableRoom ต้อง `status=available` เท่านั้น
- **เป็นกติกาเดิมที่เอกสารระบุ** ไม่ใช่การละเมิด contract ปัจจุบัน แต่จำกัดการขายห้องอนาคต จึงควรตัดสินนโยบายก่อนแก้
- แนวทางเมื่อยอมรับจองล่วงหน้า: availability ตามช่วงวัน + claims; แยก physical readiness ณ เวลา check-in, maintenance/ปิดใช้งาน และ stay ที่เกินกำหนด ห้ามเปลี่ยน occupied เป็น available เพื่อให้จองได้
- หลักฐาน: `occupied-future-availability`

### A08 — search สำหรับแก้ booking ไม่ยกเว้น claims ของตัวเอง

- พื้นที่: confirmed booking → แก้ไข → เปลี่ยนวันออก/จำนวนคน → ค้นหาห้อง
- fixture unpaid booking 16–17 ต.ค.; ค้นหาห้องเพื่อขยายถึง 18 ต.ค.
- จริง: search ไม่คืนห้องเดิม เพราะ claims เดิม; แต่ PATCH booking เดิมขยายวันผ่าน **200**
- สาเหตุ: frontend เคลียร์ roomId เมื่อเปลี่ยนเงื่อนไข; availability ไม่มี context booking ที่กำลังแก้
- แนวทาง: staff-only availability option excludeBookingId ที่ตรวจ booking/สิทธิ์ก่อนยกเว้น และยกเว้นเฉพาะ claims ของ booking นั้น ห้ามเปิด anonymous bypass
- หลักฐาน: `own-booking-search` + trace `findRooms`/resetRoomSearch

### A09 — ข้อมูลที่ 101 เป็นต้นไปหายจาก lookup และบางหน้าจัดการ

- พื้นที่: guest dropdown, dashboard joins, room types, users, payment history
- ให้ guest API รายงาน total=101; execute effect โหลด guest
- จริง: มี request `/guests?active=true&limit=100` ครั้งเดียว ไม่เรียก page 2
- ผลกระทบ: แขกที่ไม่อยู่หน้าแรกสร้างจองจาก dropdown ไม่ได้; แขก archived ใน booking history ไม่มีชื่อ; room/user/type และหลักฐานเก่าบางรายการอาจเข้าถึงไม่ได้ โดยเฉพาะรายการรับเงินต้นทางสำหรับ refund
- หลักฐาน fixture ยืนยันการไม่ตามหน้า ไม่ใช่โหลดข้อมูลจริง 101 รายการจาก production
- แนวทาง: searchable paginated selectors, id lookup สำหรับรายการที่อ้างถึง, pagination ของ admin lists/history อย่าแก้ด้วยขยาย limit อย่างเดียวหรือโหลดทุกตารางทั้งฐาน
- หลักฐาน: `guest-pagination` และ limit=100 paths ใน source

### A10 — ฟอร์มแก้ occupied room ส่ง field ที่ backend ห้าม

- URL: `PATCH /api/rooms/:id`
- เปิดฟอร์มห้อง occupied แก้เฉพาะเลขห้อง/ชั้นและบันทึก
- จริง: payload ส่ง roomTypeId เดิมเสมอ; backend ตอบ **409 ROOM_OCCUPIED** เพราะเห็น data.roomTypeId
- คาดหวัง: metadata ที่ API อนุญาตบันทึกได้ หรือ UI ปิดฟอร์มพร้อมเหตุผลตามนโยบาย
- แนวทาง: ส่งเฉพาะ field ที่เปลี่ยนและได้รับอนุญาต ล็อก type/status/active สำหรับ occupied โดยไม่ลด guard check-out ของ server
- หลักฐาน: `occupied-room-form`, `occupied-edit-http`

### A11 — floor 0 หาย

- เปิดแก้ห้องที่ floor=0
- จริง: ฟอร์มแสดง 1 และ payload เป็น 1 เพราะ `r?.floor || 1`
- แนวทาง: nullish fallback `??` รักษา 0 และชั้นติดลบ; สำหรับห้องว่างอาจบันทึกค่าที่เปลี่ยนโดยผู้ใช้ไม่ตั้งใจ
- หลักฐาน: `occupied-room-form`

### A12 — contact flow หยุดที่คำแนะนำ ไม่มีช่องทางติดต่อ

- พื้นที่: public room card → ติดต่อพนักงาน
- จริง: dialog มีรายละเอียดและปุ่มเข้าใจแล้ว แต่ไม่มีเบอร์โทร อีเมล LINE หรือ external contact link; component links มีเพียง `#discover`
- คาดหวัง: ลูกค้านอกสถานที่ติดต่อเพื่อยืนยันห้องได้
- แนวทาง: ใช้ข้อมูลโรงแรมที่เจ้าของยืนยันเท่านั้นผ่าน config; ถ้ายังไม่มีให้แสดงช่องทางยังไม่พร้อมชัดเจน ไม่สร้างเบอร์/บัญชี LINE สมมติ และไม่แปลงเป็นจองอัตโนมัติโดยไม่ออกแบบ flow
- หลักฐาน: `public-contact`; ยังไม่มี screenshot จาก browser

### A13 — invalid successful response ถูกส่งต่อเป็น null

- API helper: จำลอง HTTP 200 HTML/non-JSON จาก misconfigured proxy
- จริง: `request()` resolve null ไม่ throw; consumers เรียก `.items` หรือ field จึงเสี่ยง crash หรือแสดงโหลดค้าง
- แนวทาง: validate JSON/content-type และ shape ขั้นต่ำของ endpoint; ยกเว้น 204 ที่มี semantics no content; error ภาษาไทยแยก server payload ผิดจากข้อมูลว่าง
- หลักฐาน: `api-invalid-json`

### A14 — ไม่มีขอบเขตเวลาของ request

- สถานะ: **งาน resilience** ไม่ได้อ้างว่าทดสอบให้เครือข่าย production ค้างจริง
- ตรวจ fetch options จริง: ไม่มี signal; code ไม่สร้าง timeout
- ผลตามโค้ด: busy รอ fetch settle ไม่มี application deadline; navigation ไม่ยกเลิก request
- แนวทาง: timeout/cancellation ที่รองรับ navigation และ UI retry; การส่งรับ/คืนเงินที่ timeout ต้องใช้ idempotency key เดิมกับ payload เดิม ไม่สรุปว่า server ไม่ได้บันทึก และอย่าสุ่ม key ใหม่เพื่อ retry
- หลักฐาน: `api-invalid-json` และ source

### A15 — contrast สีข้อความรองต่ำ

- CSS: `--muted:#6d8390` บน white ratio **3.963:1**, บน `--canvas:#f5f8fa` **3.715:1**
- กระทบข้อความ 11–14px เช่น table headers, form labels, descriptions และ metric captions
- ค่าคำนวณจาก CSS tokens ไม่ใช่ computed style/browser หรือผล audit ทั้งไซต์
- เกณฑ์ข้อความขนาดปกติ WCAG AA คือ **4.5:1** ตาม [W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)
- แนวทาง: ปรับ token/คู่สีโดยตรวจ surface จริงทั้งหมด คง identity สีหลัก ไม่เพิ่ม font ทุกจุดเพื่อเลี่ยงข้อกำหนด
- หลักฐาน: `text-contrast`

### A16 — คู่มือ Atlas seed ใช้งานตามไม่ได้

- คู่มือ deploy แนะนำถ้าต้องการ demo ใน staging Atlas ให้ใช้ `db:seed:demo`
- จริง: demoConfig ปฏิเสธ mongodb+srv และ database staging ด้วยข้อความ `Demo seed only accepts a local hotel_lobby_*_demo or *_test database`
- แนวทาง: แก้เอกสารให้ตรง guard และแยกการ bootstrap admin staging ออกจาก demo seed ห้ามลบ guard เพื่อให้คู่มือผ่าน
- หลักฐาน: `atlas-demo-doc`; ทดสอบ function กับ URL ปลอม ไม่ติดต่อ Atlas

### A17 — dashboard สูญเสีย context การจองที่เลือก

- พื้นที่: การเข้าพักวันนี้ → ดูการจอง
- จริง: handler เรียก `go('bookings')` เท่านั้น ไม่ส่ง booking ID ไม่เปิด detail
- ผลกระทบ: ต้องหาเองในรายการอีกครั้ง; booking อาจอยู่คนละหน้า/ผู้เข้าพักชื่อเดียวกัน
- แนวทาง: ส่ง selected booking id ผ่าน App แล้วเปิด detail รายการนั้นหลังโหลด พร้อม guard A05 และรองรับรายการถูกยกเลิก/ไม่พบ
- หลักฐาน: `dashboard-button` และ source

## สิ่งที่ตรวจแล้วไม่ควรแก้ผิดทาง

- frontend reset payment idempotency key เมื่อแก้ field อยู่แล้ว (`payment-edited-retry`: sameKey=false)
- server ปฏิเสธใช้ key เดิมกับ payload ต่างกัน **409 IDEMPOTENCY_CONFLICT** ถูกต้อง (`payment-server-conflict`)
- เงินจำนวนเต็ม, ledger transaction, claims unique index, auth/role guards และ isolated runner มีฐานเดิมที่ใช้ได้ ชุดทดสอบเดิมผ่าน อย่าลบเพื่อทำงานใหม่ให้เร็ว
- ข้อจำกัด occupied เป็น contract เดิม ต้องแก้ specification/tests พร้อมกันถ้าเปลี่ยนนโยบาย

## ยังไม่ได้ยืนยัน / coverage ที่ต้องทำต่อ

- หน้าตาจริง desktop/mobile, responsive overflow, scrolling, focus trap, keyboard และ screen reader; ไม่มีภาพ screenshot จึงไม่มีการอ้างผล visual QA
- remote CI, Vercel/Render deployment, CORS origins และ proxy topology จริง
- ประสิทธิภาพกับขนาดข้อมูลจริง: availability โหลด candidates/claims ก่อน slice ไม่ใช่ DB pagination ควรวัดก่อนปรับ
- concurrency ระหว่าง CRUD room/type/guest กับ create booking: ยังไม่ได้พิสูจน์ orphan/reference race ห้ามเรียกว่า bug ที่ยืนยันแล้ว ให้เพิ่ม invariants tests
- recovery หลัง server commit แล้ว network response หาย, stale operation ระหว่าง logout/tab switch, การปรับราคาและ late stay policy
- backup/restore และ migration/reconciliation ของข้อมูลเดิม; ไม่ทดสอบกับฐานจริง
- public contact details และกฎจองล่วงหน้าต้องอิงข้อมูล/นโยบายของเจ้าของ ไม่เดา

## ใช้งานไฟล์หลักฐาน

- `evidence.json` = ผลที่รันจริงล่าสุด ไม่ใช่ผลหลังแก้
- `probes.cjs` = harness/HTTP diagnostic ที่รัน handlers จาก source จริง ไม่ใช่ browser E2E ไม่ใช่ substitute ของ test suite
- รันจาก root: `node docs/qa-2026-10-13/probes.cjs` ใช้ dependencies client/server ที่ติดตั้งแล้ว; สร้าง MongoDB memory replica set ใหม่ ผ่าน helper startDatabase ของ repo และปิดใน finally
- Probe สร้าง/เปลี่ยน credentials และ ledger **เฉพาะ fixture DB ชั่วคราว** และเขียนทับ evidence.json ในโฟลเดอร์รายงาน ไม่แตะ .env หรือฐานจริง
- `ai-fix-plan.md` = คำสั่งพร้อมเกณฑ์รับงานให้ AI ทำเป็นชุดตามลำดับ

ครับคุณชายภูสุดหล่อ
