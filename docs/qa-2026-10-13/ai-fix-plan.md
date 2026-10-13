# แผนสั่ง AI แก้ Hotel-Lobby

ใช้กับ `C:/Users/Administrator/Desktop/Hotel-Lobby` อ้างอิง `report.md` และ `evidence.json` ในโฟลเดอร์นี้

## วิธีใช้

ส่ง **คำสั่งหลัก** พร้อม **งานทีละชุด** ตามลำดับด้านล่าง ไม่สั่งแก้ทั้งหมดพร้อมกัน แต่ละชุดต้องมี diff, regression tests และผลรันก่อนต่อชุดถัดไป โค้ดปัจจุบันยังไม่ได้ถูกแก้โดย audit นี้

ลำดับ: **ชุด 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**

## คำสั่งหลัก — แปะทุกครั้ง

```text
ทำงานใน C:/Users/Administrator/Desktop/Hotel-Lobby
อ่าน AGENTS.md ถ้ามี, README.md, docs/qa-2026-10-13/report.md และ evidence.json ก่อน
ตรวจ git status และรักษางานผู้ใช้ ห้าม reset/ทับงานที่ไม่เกี่ยว
ทำเฉพาะชุดที่ระบุด้านล่าง ไม่ rewrite ทั้งแอป ไม่เปลี่ยนดีไซน์ทั้งหมด
ก่อนแก้แต่ละปัญหา สร้าง regression test ที่ทำซ้ำ failure จาก source จริง และเห็น fail ก่อน
แก้ root cause แล้วทดสอบให้ผ่าน ไม่ลบ guard/tests/unique indexes เพื่อหลบ failure
ไม่เปิดเผย secrets ไม่แก้ .env ไม่ใช้ฐานจริง ไม่ db:push/seed/backfill ลงฐานผู้ใช้
ทดสอบ MongoDB ด้วย replica set ชั่วคราวและ fixture เท่านั้น; ปิด process หลังทดสอบ
ห้าม deploy/merge/push โดยไม่ถูกสั่ง; ไม่เพิ่ม plugin หรือ dependency ถ้าไม่จำเป็น
ห้ามเดานโยบายโรงแรม เบอร์โทร LINE หรือบัญชีจริง
หากต้องเปลี่ยน business contract ให้เตรียมข้อเสนอและ impact ก่อน ไม่แอบเปลี่ยนกติกา
รายงานท้ายงาน: files changed, root cause, tests ที่รันและผลจริง, สิ่งที่ยังไม่ได้ยืนยัน
อย่าอ้างว่า UI/staging ผ่านถ้าไม่ได้เปิด browser/deploy จริง
```

## ชุด 1 — บัญชีและ session [A01 A02 A03]

```text
แก้ password validation/normalization และ session revocation
ดู api-users.js, api-auth.js, lib/auth.js, seed-demo.js และ tests ที่เกี่ยวข้อง
1) สร้างนโยบาย password เดียวกันทั้ง create/change/login/seed
   bcrypt มีขีดจำกัด 72 UTF-8 bytes: ห้ามยอมรับ input ที่ถูก truncate เงียบ
   เลือกวิธีที่เข้ากันได้กับ hash เดิม; ห้ามย้าย hashing scheme หรือแปลงบัญชีเดิมโดยไม่มีแผน migration
2) login ต้องไม่ trim password คนละแบบกับการตั้ง password
   preserve input ตรงตัว หรือ reject whitespace ตั้งแต่ต้นอย่างสอดคล้องและระบุ policy
3) เมื่อเปลี่ยน password ถอน sessions ของบัญชีนั้นแบบ atomic
   account ที่ไม่ได้เปลี่ยนต้องไม่ถูก logout; เปลี่ยนรหัสตัวเองแล้ว UI กลับ login ชัดเจน
4) ให้ข้อความ validation อธิบายข้อจำกัดรวมอักษรไทย/UTF-8 โดยไม่เปิดเผยบัญชีที่มีอยู่
Acceptance:
- ASCII 73 bytes และภาษาไทยที่เกิน 72 bytes ไม่ถูกยอมรับแบบเงียบ
- รหัสผ่านต่าง suffix ต้องไม่ authenticate; boundary 72 bytes ถูกทดสอบ
- password space หัวท้ายไม่สร้างบัญชีที่ใช้งานไม่ได้
- token ที่มีอยู่ก่อน change password ได้ 401 หลังเปลี่ยนสำเร็จ
- ปิด user / demote admin / last-admin guard เดิมยังทำงาน
รัน backend auth/HTTP regression และ npm run test:all:isolated; client lint/test/build ถ้าเปลี่ยน UI
```

## ชุด 2 — คำตอบ request เก่าและการเปิดรายละเอียด [A05 A06 A17]

```text
แก้ async race ใน useList และ BookingsView.detail ก่อน refactor UI
นำ pattern latest-request-wins ของ StaffAvailability มาประเมินใช้ ไม่ copy โดยไม่ตรวจ lifecycle
1) path/filter/page เปลี่ยนแล้ว data/error/loading ของ request เก่าต้องไม่ทับ request ล่าสุด
2) เลือก detail A แล้ว B ให้ booking/payment/transactions ของ B เป็นชุดเดียวกันเสมอ
3) close modal / เปลี่ยน tab / logout ต้อง invalidate pending detail ไม่เปิด modal ย้อนกลับ
4) dashboard ปุ่มดูการจองต้องส่ง booking id และเปิดรายละเอียดตัวที่กด ไม่แค่เปลี่ยน tab
Acceptance:
- deferred tests resolve/reject A หลัง B ทุกกรณี ยังเห็น B ไม่มี stale error/loading
- pending request หลัง close/unmount ไม่เปลี่ยน current selection
- เลือก action รับเงิน/check-in ใช้ id ของ modal ปัจจุบันเท่านั้น
- dashboard เลือก booking ที่อยู่นอก list page แรกได้ถูกต้อง
- ไม่เพิ่ม network request loop จาก hook deps และไม่กินข้อมูลคนละ session
รัน client regression/lint/build และ browser smoke ถ้า browser พร้อม
```

## ชุด 3 — แก้ booking ที่ใช้ห้องเดิม [A08]

```text
แก้ availability flow สำหรับแก้ confirmed booking
เพิ่ม edit context แบบ staff-only เช่น excludeBookingId โดยตรวจ reference, booking state และ actor role
ยกเว้นเฉพาะ room-night claims ของ booking ที่กำลังแก้ ไม่ยกเว้น booking อื่น
public API ต้องไม่รับ/ใช้ context นี้เพื่อ bypass การจอง
frontend ต้องส่ง context จาก selected booking และรักษาราคาเดิมตาม pricing contract เมื่อ stay ไม่เปลี่ยน
Acceptance:
- unpaid booking ขยาย/ย่อวันและเปลี่ยนจำนวนคนใน capacity แล้วเลือกห้องเดิมได้ถ้าไม่มี conflict อื่น
- ช่วงทับ booking อื่นถูก reject ทั้ง search และ confirm; transaction rollback เดิมครบ
- booking id ปลอม/state ไม่เหมาะสมได้ error contract ไม่เปิด bypass
- public excludeBookingId ถูกปฏิเสธ ไม่ leak booking details
- paid booking ที่เปลี่ยนยอดยังเคารพ PAYMENT_ADJUSTMENT_REQUIRED
เพิ่ม backend HTTP/service tests, client handler test และอัปเดต OpenAPI/docs; รัน isolated suite
```

## ชุด 4 — ทบทวนจองอนาคตเมื่อห้อง occupied [A07]

```text
ขั้นแรกจัดทำ decision note: ปัจจุบัน contract อนุญาตเฉพาะ status available แม้ค้นวันอนาคต
เสนอ flow แยก physical room state วันนี้ ออกจาก bookability ตามช่วงวัน
เตรียม impact ต่อ availability, booking-service, stay-service, dashboard, late stay และ maintenance
หากไม่มีนโยบายที่ยืนยัน ให้ส่ง decision note/test scenarios โดยยังไม่เปลี่ยน contract
หากอนุมัติจองล่วงหน้าไว้แล้ว จึง implement ด้วย claims/date range ไม่ตั้ง occupied เป็น available
Acceptance ของแนวทางจองล่วงหน้า:
- occupied ที่กำหนดออก 14 ต.ค. รับจอง 16–17 ต.ค. ได้เมื่อไม่มี claims/maintenance conflict
- วันที่ชน stay เดิมหรือ booking ใหม่ไม่ได้; concurrent create ยังได้ผู้ชนะคนเดียว
- check-in ยังตรวจ physical readiness และ other active occupant
- late stay/overdue room มี policy และ error ที่ชัด ไม่ขายห้องเกินจริง
- specs และ tests เดิมที่ต้อง available ถูกปรับอย่างตั้งใจพร้อมอธิบาย
```

## ชุด 5 — ข้อมูลเกิน 100 และ room editor [A09 A10 A11]

```text
แก้การตัดข้อมูลหน้าแรกใน guest selector, dashboard joins, users/types และ payment history
ใช้ server-side search/pagination สำหรับ selector และ list; lookup by id สำหรับข้อมูลที่ถูกอ้างถึง
หลีกเลี่ยงโหลดทุกตารางทั้งฐานเพื่อแสดงชื่อ; archived guest ใน history ต้องยังอ่านชื่อได้ตามสิทธิ์
history ต้องหา receipt ต้นทางสำหรับ refund ได้แม้อยู่นอก 100 รายการล่าสุด
แก้ RoomsView ให้ส่ง PATCH เฉพาะ fields ที่เปลี่ยน/อนุญาต และใช้ floor ?? 1 ไม่ใช่ || 1
occupied room ล็อก type/status/active ใน UI; ห้ามลด server ROOM_OCCUPIED guard
Acceptance:
- 101+ guests: เลือกแขกนอกหน้าแรกเพื่อสร้าง booking ได้; ชื่อ/ห้อง dashboard ถูกต้อง
- 101+ users/types: ทุก record เข้าถึงและแก้ได้ผ่าน pagination/search
- 101+ transactions: ดูและอ้าง receipt เก่าได้ ไม่ทำ ledger summary ผิด
- metadata ของ occupied room บันทึกตาม policy ได้ ไม่มี unchanged roomTypeId ถูกส่งโดยไม่จำเป็น
- floor 0 และติดลบคงเดิมเมื่อเปิด/บันทึก ไม่เปลี่ยนค่าเอง
tests ต้องมี boundary ข้ามหน้า และรัน client lint/test/build + backend guards ที่เกี่ยว
```

## ชุด 6 — API ที่ตอบผิด/ค้าง และ contact flow [A12 A13 A14]

```text
เพิ่ม protocol validation, request timeout และ lifecycle cancellation ใน api.ts
204 ยังใช้ได้ตาม endpoint; 200 HTML/non-JSON/null/shape ผิดต้องเป็น error ไม่ silent success
error/retry แสดงภาษาไทยพร้อม requestId เมื่อมี; แยก empty result จาก server failure
คำขอเขียนที่ timeout อาจ commit แล้ว: retry payment ด้วย key+payload เดิม ห้ามสรุปว่าไม่บันทึก
เพิ่มช่องทางติดต่อที่ public contact dialog ผ่าน config ที่เจ้าของยืนยัน
หากไม่มีข้อมูลติดต่อจริง แสดงสถานะยังไม่พร้อมและช่อง config ที่ต้องเติม ไม่สร้างเบอร์/LINE สมมติ
ห้ามเพิ่ม public booking/payment checkout โดยไม่ได้ถูกสั่ง
Acceptance:
- JSON success, 204, invalid JSON 200, 4xx/5xx, network failure และ delayed request มีผลที่ต่างกันชัด
- timeout/retry ไม่ค้าง busy และ unmount ยกเลิก read request ได้
- payment server commit + response lost retry มี ledger แถวเดียวด้วย key เดิม
- contact dialog แสดงช่องทางจริงที่ configured และข้อมูล stay ที่ตรงกับผลค้นหา
- client lint/test/build และ HTTP integration ผ่าน
```

## ชุด 7 — Proxy, deployment และ docs [A04 A16]

```text
จัด config trusted proxy แบบ explicit ตาม topology ที่ยืนยันได้ ไม่ trust ทุก forwarded header
เพิ่ม proxy simulation tests: trusted chain อ่าน client IP/HTTPS ถูก, untrusted direct request spoof ไม่ได้
พิจารณา limiter/shared store ตามจำนวน instance จริง; อย่าเพิ่ม Redis หากยังไม่มีเหตุจำเป็น
staging ต้องทดสอบผู้ใช้สอง IP ไม่แชร์ auth quota โดยผิดพลาด และ CORS client/public origins จริง
แก้ deploy docs ที่แนะนำ seed-demo บน Atlas ให้ตรง local-only guard
แยก bootstrap admin staging ที่ปลอดภัยในคู่มือ; อย่าลบ guard seed หรือ auto push schema ตอน deploy
Acceptance:
- direct spoof header ไม่ bypass limiter; proxy ต่าง client ไม่ถูกแชร์ quota โดยผิดพลาด
- HTTPS detection/HSTS มี owner ชัดว่าแอปหรือ edge เป็นผู้ตั้ง และทดสอบจริงเมื่อ staging พร้อม
- คำสั่งในเอกสารใช้ได้ตรงกับ code guard; secrets ไม่อยู่ใน repo/output
- ไม่มีการ deploy/seed Atlas จริงในงานนี้ถ้าไม่ได้ถูกสั่ง
```

## ชุด 8 — Accessibility และการตรวจรับเว็บจริง [A15 + coverage gaps]

```text
แก้ contrast ของข้อความรองขนาดเล็ก โดยคำนวณคู่สีบน surface จริง
คงสีแบรนด์และ layout เท่าที่จำเป็น ไม่ redesign ทั้งเว็บ
เปิด browser ทดสอบทั้ง admin/receptionist/public กับ DB fixture แยก:
public search/pagination/error/contact, login/logout, guest CRUD, room/type/user CRUD,
create/edit/cancel booking, receipt/refund, check-in/out, dashboard/report
ทดสอบ widths 320,390,768,1280; keyboard Tab/Shift+Tab/Escape/focus restore,
scroll, long names, no results, 101+ records, stale network และ invalid payload
เก็บ screenshot และ console/network errors จริง แยกสิ่งที่ยังไม่ได้ตรวจ
Acceptance:
- ข้อความขนาดปกติ contrast อย่างน้อย 4.5:1 บนทุก surface ที่ใช้
- ไม่มี horizontal page overflow ที่ไม่ได้ตั้งใจ; table scroll ไม่บัง action
- modal/confirmation ใช้ keyboard ได้ ไม่มี focus หลุด/กลับผิดจุด
- guest/payment/booking ที่เห็นตรงกับรายการที่เลือกทุกขั้น
- tests/lint/build/schema validate/npm audit ตาม lockfile ผ่าน
- staging ยังไม่พร้อมต้องระบุ blocker ไม่อ้างว่า deploy ผ่าน
```

## สิ่งที่ต้องมีในรายงานจบแต่ละชุด

```text
1. Issue IDs ที่แก้ / ที่ยังค้าง พร้อมเหตุผล
2. Root cause และไฟล์ที่เปลี่ยน
3. Regression ที่เห็น fail ก่อนแก้ และผล pass หลังแก้ (output จริง)
4. Commands ที่รัน, exit status และ test scope
5. Browser/staging screenshots ถ้าทดสอบจริง; ไม่ใช้รูปสร้างแทนหลักฐาน
6. Contract/migration impact ถ้ามี และ rollback plan เมื่อจำเป็น
7. Git diff สรุปและขั้นตอนตรวจรับของเจ้าของ
```

ไม่ต้องเพิ่ม feature รายงานบัญชี/ชำระออนไลน์/ระบบจองใหม่ทั้งหมดเพื่อปิด audit นี้ ส่วน performance, CRUD concurrency และ backup rehearsal ให้เป็นงานตรวจเพิ่มเติมหลังข้อยืนยันสำคัญถูกแก้แล้ว

ครับคุณชายภูสุดหล่อ
