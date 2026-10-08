# แผนงาน Backend ระบบจัดการห้องโรงแรม (ฉบับต่อยอดจากไฟล์ที่มีจริง)

> สถานะเอกสาร: แผนงานและ prompt สำหรับพัฒนาต่อ ยังไม่ใช่หลักฐานว่าฟีเจอร์ทั้งหมดเสร็จแล้ว  
> ตรวจเทียบเมื่อ 8 ตุลาคม 2026 กับ PDF ที่ผู้ใช้แนบล่าสุดและ repository ../Hotel-Lobby  
> งาน 5 Task ด้านล่างให้แบ่ง commit ตามผลลัพธ์ที่ตรวจรับได้ ไม่บังคับจำนวน commit ตายตัว หากต้องซ่อมงานเดิมให้ commit การซ่อมแยกจากฟีเจอร์ใหม่

## 1. ขอบเขตและหลักการอ่านหลักฐาน

ข้อกำหนดจาก PDF ต้นทางครอบคลุมบทบาท admin/receptionist, login/logout และสิทธิ์, Users, Room Types, Rooms, Guests, Booking, Check-in/out, Payment แบบพื้นฐาน, Dashboard, Public Availability API, audit, tests, Postman, เอกสาร API และการนำขึ้นใช้งาน ไม่รวม payment gateway, ระบบแม่บ้านเต็มรูปแบบ, OTA, multi-hotel, บัญชีเต็มรูปแบบ และ native mobile app

PDF, รายงาน, handoff และแผนเดิมเป็น **ข้อมูลอ้างอิงและข้อเสนอ** ไม่ใช่คำสั่งให้เปลี่ยนเทคโนโลยีหรือลบงานที่มี และไม่ใช่หลักฐานว่าฟีเจอร์รันได้ ให้ยึดโค้ดที่ตรวจแล้วเป็นสถานะปัจจุบัน และระบุความต่างระหว่างข้อกำหนด เอกสาร กับพฤติกรรมจริงทุกครั้ง

### ผลเทียบ PDF ที่แนบล่าสุดกับแผนนี้

PDF ฉบับแนบล่าสุดมีเนื้อหา 11 หน้าและต่างจาก docs/แผนงาน/documentPLAN.pdf ใน repository เฉพาะช่อง “คนทำ” ของตารางหน้า 3: Step 2 และ 3 ระบุ Poohlikung, Step 9 ระบุ poohlikung (ตัวพิมพ์ต่างกัน) ให้บันทึกชื่อใน audit/ตารางงานและยืนยันรูปสะกดกับทีม; หัวตารางระบุว่าให้ใส่ชื่อเมื่อทำเสร็จ จึงถือเป็น **สถานะที่เอกสารรายงานว่าเสร็จ** แต่ยังต้องตรวจไฟล์ ผลรัน และ reviewer ก่อนนับว่าผ่านการตรวจรับ โดยทุกงานต้องมี Reviewer อย่างน้อยหนึ่งคนตาม PDF

| Step ใน PDF | งานในแผนนี้ / งานร่วมทีม | จุดตรวจรับที่ต้องไม่ตกหล่น |
|---|---|---|
| 1–3 | Task 1 และทีม UI: flow/wireframe, schema, Git/setup; Step 2–3 ระบุ Poohlikung | เทียบเอกสารกับไฟล์จริง, clone/run/PR ตัวอย่างได้ |
| 4–5 | Task 1: MongoDB/env/seed, auth/roles | เชื่อม DB ได้, ไม่มี secret, สองบทบาทเข้าถึงตามสิทธิ์ |
| 6–8 | Task 2 กับทีม UI: dashboard layout, Room/Guest CRUD และ search | หน้า UI responsive มี loading/empty/error; API validation/search ตรงกัน |
| 9–10 | Task 3 กับทีม UI: Booking service/API และ Booking UI; Step 9 ระบุ poohlikung | แยกหลักฐาน service ของ Step 9 จาก HTTP/UI ของ Step 10; ไม่มี double booking และพนักงานเห็น conflict ได้ |
| 11–12 | Task 4–5: operation/payment และ Public API | สถานะสัมพันธ์กัน; Postman หรือเว็บอื่นเรียก JSON ได้ |
| 13–17 | Task 5 ร่วมกับทีม UI/QA: เชื่อมทุก API, tests, system/security/responsive, deploy, README/API docs/slide/demo | happy/error paths, URL demo, seed, เอกสารและสาธิต 8–10 นาทีตาม PDF |

เอกสารนี้เป็นแผน **backend** จึงระบุงาน UI ในจุดส่งต่อและเกณฑ์ตรวจรับร่วม ไม่ให้สรุปว่าโครงการ MVP เสร็จเมื่อ backend ผ่านเพียงฝั่งเดียว PDF กล่าวถึง Next.js/Tailwind/JavaScript แต่แผนภาพหน้า 10 มี React หรือ EJS; repository ปัจจุบันเป็น Vite/React/TypeScript จึงต้องตัดสินใจ stack UI แยกจากการ audit backend ตัวอย่าง External API เช่นสภาพอากาศใน PDF เป็นข้อเสนอเสริม; ให้ทำหลัง MVP หลักหากทีมเลือกเพิ่ม

### สิ่งที่พบจาก repository ปัจจุบัน

| ส่วน | ไฟล์/หลักฐานที่มี | สถานะที่ยืนยันได้และงานค้าง |
|---|---|---|
| Runtime | server/app.js, server/bin/www, server/routes/index.js, server/routes/users.js | ยังเป็น Express generator; route หลักยังคืนหน้า Jade/ข้อความตัวอย่าง ไม่มี REST API โรงแรม, auth หรือ error contract |
| ฐานข้อมูล | server/prisma/schema.prisma, server/lib/prisma.js, server/.env.example, server/scripts/* | ใช้ Prisma 6 + MongoDB ไม่ใช่ Mongoose; schema validate ผ่าน แต่ยังไม่ได้พิสูจน์การใช้กับฐาน hotel_lobby จริง; สคริปต์ MongoDB อ้างพาธ mongod ที่ไม่มีในเครื่องที่ตรวจ |
| โมเดล | User, RoomType, Room, Guest, Booking, Payment, RoomNightClaim | Room ใช้ฟิลด์ number และ map ไป collection Room; ห้าม rename หรือเปลี่ยน collection โดยไม่มีแผนย้ายข้อมูล; RoomType/Room/Guest ยังไม่มี actor audit ตามเอกสารแบบข้อมูล; Payment เป็นยอดสรุป 1 รายการต่อ booking ไม่ใช่ ledger รายธุรกรรม |
| Booking service | server/services/booking-validation.js, availability-service.js, booking-service.js | มี validation วันที่/ความจุ/ราคา, ค้นหาห้องว่าง, create/update/cancel ใน transaction และ unique (roomId, night); ยังไม่มี HTTP route และ actorId ต้องมาจาก auth ที่เชื่อถือได้ |
| Tests | server/tests/*.test.js, test-db.js | Jest unit test วันที่ 8 กรณีผ่านในการตรวจครั้งนี้; integration tests ในเอกสาร handoff เคยรายงาน 21 tests ผ่าน แต่ครั้งนี้ยังรันยืนยันซ้ำไม่ได้ เพราะ MongoDB 127.0.0.1:27018 ไม่ทำงาน |
| Frontend | client/src/*, client/package.json, client/README.md | ยังเป็น Vite/React/TypeScript starter ไม่ใช่ Booking UI; PDF ระบุ Next.js/Tailwind/JavaScript แต่แผนภาพอีกหน้าเขียน React หรือ EJS จึงต้องบันทึก stack ที่ทีมเลือกก่อนทำ UI; lint/build ครั้งนี้เริ่มไม่ได้เพราะ executable eslint/tsc ใน client dependencies ไม่พร้อม |
| เอกสาร | README.md, docs/step2-*, docs/step9-*, docs/PLAN/*, PDF/DOCX และ docsfix.md | มีแบบข้อมูล ข้อมูลตัวอย่างและ handoff แต่บางข้อความยังเป็นสถานะในอดีต/ข้อเสนอ; sample JSON มี audit/roomNumber ที่ test-db.js ต้องแปลงหรือตัดก่อน seed จึงยังไม่ใช่ production seed โดยตรง ต้องเทียบกับ schema, route และผลทดสอบจริงก่อนอ้างว่าเสร็จ |
| Git | .gitignore, tracked files | .gitignore ระบุ node_modules แต่ Git ยัง track ไฟล์ใต้ client/server node_modules จำนวนมาก; ต้องตรวจ index และจัดการใน commit แยกโดยไม่ลบไฟล์งานหรือ lockfile ผิดพลาด |

การตรวจเบื้องต้นนี้ **ยังไม่ใช่ audit ครบทุกไฟล์**; Task 1 ต้องทำรายการทุกไฟล์ที่ทีมสร้างเองอย่างเป็นระบบ รวม source, config, scripts, tests, README, data fixture, lockfiles, assets และเอกสาร PDF/DOCX โดยตัด dependency/generated cache ออกจากการอ่านเนื้อหารายไฟล์ แต่ต้องตรวจว่า dependency/generated ถูก track หรือหลุดเข้า commit หรือไม่

### ข้อตกลงที่มีในโค้ดและต้องรักษาจนกว่าจะมีการตัดสินใจเปลี่ยน

- วันที่พักใช้ YYYY-MM-DD และช่วง [checkInDate, checkOutDate); สูงสุด 365 คืน; คืนวัน check-out จองต่อได้
- ราคาใน schema/service เป็นจำนวนเต็ม **บาท**; อย่าเปลี่ยนชื่อเป็น amountMinor หรือเปลี่ยนเป็นสตางค์เฉพาะบางโมดูล
- Booking เก็บ pricePerNight/totalPrice snapshot; RoomNightClaim unique (roomId, night) เป็นหลักกันจองซ้อน โดยสร้าง/แทน/ลบพร้อม Booking ใน transaction
- ห้องเก่าที่มีเพียง number อาจอ่านได้ แต่ยังจองไม่ได้จน room type/status/active ถูกเติมอย่างถูกต้อง
- Service error ปัจจุบันใช้ HTTP 400 สำหรับ validation; แผนเก่าระบุ 422 จึงต้องเลือก contract เดียวและปรับ service, tests, เอกสาร, frontend ให้ตรงกัน
- ใช้ Public API path ตามตัวอย่างชัดที่สุดใน PDF คือ /api/public/rooms/availability เป็นค่าเริ่มต้น; หากทีมเลือก /api/v1/public/... ให้บันทึกเหตุผลและอัปเดต Postman/frontend/เอกสารพร้อมกัน

## 2. กฎการตรวจไฟล์และการเปลี่ยนฐานข้อมูล

ก่อนเขียนฟีเจอร์ ให้ทำ audit register ที่ docs/implementation-audit.md โดยมี 1 แถวต่อไฟล์ทีมสร้างเอง: path, จุดประสงค์, สถานะ (ใช้งานจริง/ต้นแบบ/ข้อมูลอ้างอิง/ล้าสมัย), หลักฐานการรันหรือการอ่าน, ความต่างจาก requirement, ความเสี่ยง, งานที่ต้องแก้ และผู้รับผิดชอบ ห้ามใช้เพียงชื่อไฟล์หรือคำว่า “มีแล้ว” เป็นหลักฐานเสร็จ

ตรวจครบอย่างน้อยกลุ่มต่อไปนี้:

1. server: entrypoint, routes, services, Prisma schema/client, scripts, tests, package/lockfile, env example, view/static starter และไฟล์ซ่อนที่เกี่ยวข้อง
2. client: entrypoint, App, styles/assets, config, package/lockfile และ README เพื่อตรวจ contract ที่ต้องเชื่อมกับ backend
3. docs: PDF แผนต้นทาง, แบบข้อมูล, sample JSON, handoff, PDF/DOCX รายงานและ docsfix; เทียบชื่อฟิลด์, stack, endpoint, สถานะงานและข้ออ้างผลทดสอบ
4. Git: tracked/untracked/ignored files, node_modules ที่ track อยู่, secret/config และประวัติการเปลี่ยน schema ที่จำเป็นต่อการย้ายข้อมูล

ก่อน db push, seed หรือ backfill ไปฐานที่มีข้อมูล: ระบุ URL/ชื่อฐานให้ชัด, อ่าน collections/index/count และตัวอย่างเอกสารแบบ read-only, สำรองข้อมูล, ออกแผน migration/backfill ที่รันซ้ำได้, ทดสอบกับสำเนาหรือฐานแยก, ตรวจ unique collisions/orphan references/claims, แล้วจึงดำเนินการกับฐานเป้าหมายพร้อม rollback plan ห้ามให้ test helper ชี้ไปฐาน hotel_lobby หรือ production; integration test ต้องใช้ฐานแยกและมี guard ตรวจชื่อฐาน

## ลำดับทำงานเมื่อ frontend ยังไม่เสร็จ

Task 1–4 ทำและตรวจรับฝั่ง backend ได้โดยไม่รอหน้าเว็บ ใช้ Supertest/Jest สำหรับ HTTP และ business rules, ฐาน MongoDB ทดสอบแยก, Postman หรือ HTTP client ภายนอกสำหรับ public API และ fixture สำหรับ dashboard/flow จริง ระบุ request/response/error/role ใน OpenAPI ให้ทีม UI ใช้เป็นสัญญาเดียวกัน

Task 5 ส่วน Dashboard API, Public API, security, เอกสาร, CI และการ deploy **backend** ก็ปิดงานได้โดยอิสระ ทดสอบ CORS/cookie ด้วย origin จำลองตามค่าที่กำหนดไว้ และทวนค่า origin อีกครั้งเมื่อ frontend มี URL จริง การเชื่อม UI, responsive/loading/empty/error/permission states, frontend build/deploy และ demo ของทั้งระบบเป็นเกณฑ์ปิด **MVP ทั้งโครงการ** หลัง frontend พร้อม ไม่ใช่ตัวบล็อกการตรวจรับ backend

## Task 1 — Audit ทุกไฟล์, ตกลง contract, จัดฐานรัน และสร้าง Auth/API foundation

**ผลลัพธ์:** รู้สถานะงานเดิมแบบตรวจย้อนกลับได้, รัน baseline ได้, รักษาข้อมูลเดิม, มี API foundation และตัวตน/สิทธิ์ที่ใช้ผูก service ได้อย่างปลอดภัย

**Prompt สำหรับสั่ง AI**

~~~text
เริ่มจากอ่าน BACKEND_WORK_PLAN.md และ audit ไฟล์ทีมสร้างเองทั้งหมดใน ../Hotel-Lobby ตามหัวข้อ 2 ก่อนแก้โค้ด บันทึกสถานะพร้อมหลักฐานใน docs/implementation-audit.md แยก "ผ่าน", "ไม่ผ่าน", "ยังรันไม่ได้" ให้ชัด รักษา Prisma 6/MongoDB, Room.number และ collection Room ที่มีอยู่ ห้ามย้ายไป Mongoose หรือ db push ฐานจริงโดยพลการ จากนั้นทำ Task 1 เป็นชุด commit ตรวจรับได้ รายงานคำสั่งที่รัน ผลจริง และไฟล์ที่เปลี่ยน
~~~

1. **ทำ inventory และ gap matrix**: ตรวจทุกไฟล์ตามรายการข้างบนและ PDF/DOCX ที่เกี่ยวข้อง; เทียบ PDF → schema → service → test → API → UI; ตรวจ sample JSON ว่า seed ได้จริงหรือเป็นเพียง fixture; บันทึกสถานะ “รายงานว่าเสร็จ” และ Owner ที่ PDF ระบุสำหรับ Step 2, 3, 9 แล้วตรวจหลักฐานจริงและหา Reviewer ตามข้อตกลงทีม; ระบุไฟล์ starter/ซ้ำ/ล้าสมัยโดยยังไม่ลบทิ้งก่อนพิสูจน์การอ้างอิง  
   **ตรวจรับ:** audit register ครบทุกไฟล์ทีมสร้างเอง, มีตาราง requirement-to-evidence, blocker และลำดับแก้ไข; ไม่มีคำว่า “เสร็จแล้ว” หากมีเพียงเอกสารหรือ test เก่า
2. **ซ่อมสภาพแวดล้อมและ hygiene**: ตรวจ Node/npm, Prisma generate/validate, MongoDB replica set และ server tests; สำรวจสถานะ client install/lint/build เพื่อส่งต่อทีม UI โดยบันทึกเป็น blocker ของ frontend แยกจาก backend; ทำขั้นตอนติดตั้ง MongoDB ที่ไม่ผูกพาธเครื่องเดียว; ตรวจ .env.example, .gitignore, lockfiles และ tracked node_modules; เอา dependency ออกจาก Git index อย่างระวังใน commit แยก หากยืนยันว่าเป็น dependency จริง  
   **ตรวจรับ:** คำสั่ง setup ที่ทำซ้ำได้จาก checkout ใหม่; ผลรันจริงถูกบันทึก; ไม่มี secret หรือ dependency generated ที่ไม่ควร track
3. **ตรวจ schema/ข้อมูลเดิมก่อนเปลี่ยน**: ยืนยัน collection Room/field number, optional fields ของเอกสารเก่า, unique indexes และ RoomNightClaim; ตรวจข้อแตกต่างระหว่าง docs/step2-data-model.md กับ schema จริง โดยเฉพาะ audit fields และ Payment summary; ออก migration/backfill plan และ test fixture แยกก่อนแก้ production  
   **ตรวจรับ:** มี data inventory, backup/rollback steps และผลทดสอบบนฐานแยก; legacy room ยังอ่านได้และไม่ถูกย้ายเงียบ ๆ
4. **สร้าง REST foundation กับ auth**: ใช้ server/app.js เป็น Express app สำหรับ Supertest; เพิ่ม route prefix/health, JSON error format, input validation, request id, auth login/logout/me, password hash, inactive-user guard, role middleware, session/token policy และ CORS/cookie/CSRF ที่สอดคล้อง deployment; actorId ของ booking ต้องมาจาก identity ฝั่ง server เท่านั้น  
   **ตรวจรับ:** anonymous ได้ 401, role ผิดได้ 403, input ผิดได้ status/code เดียวกับ contract, logout ทำให้ session/token ใช้ต่อไม่ได้ตามวิธีที่เลือก; response/log ไม่เผย hash/token
5. **ล็อก contract และทดสอบ route**: เขียน API conventions, role matrix, timezone, price unit, validation status 400 หรือ 422, path version, cookie policy; ทดสอบ login/logout/me/permission ผ่าน HTTP โดยใช้ฐานทดสอบมี guard  
   **ตรวจรับ:** OpenAPI/ตัวอย่าง request-response ครบพอให้ frontend ใช้ contract โดยไม่เดาฟิลด์; backend tests จาก clean test DB ผ่าน หรือบันทึก blocker ที่พิสูจน์แล้วอย่างตรงไปตรงมา

## Task 2 — Users, Room Types, Rooms และ Guests โดยต่อจาก schema เดิม

**ผลลัพธ์:** CRUD/Search ที่ตรวจสิทธิ์จาก backend และไม่ทำลายประวัติหรือข้อมูลห้องเดิม

**Prompt สำหรับสั่ง AI**

~~~text
ทำ Task 2 ต่อจาก audit และ Auth/API contract ที่ยืนยันแล้ว ใช้ Prisma schema และชื่อฟิลด์เดิมอย่างตั้งใจ ทุก endpoint ต้องมี validation, pagination, role check, audit และ integration test ตรวจ legacy Room.number ก่อนแก้ schema ห้าม hard-delete record ที่มี booking อ้างอยู่ สรุปผลทดสอบแยกตาม module
~~~

1. **Users**: admin จัดการ list/create/update/deactivate/role; hash password; ป้องกันปิด admin คนสุดท้ายและปิดตัวเองจนระบบไม่มีผู้ดูแล; ไม่คืน passwordHash
2. **Room Types**: admin เขียน, receptionist อ่าน; nameKey unique, capacity/price/amenities validation; ปฏิเสธลบชน reference หรือใช้ active=false ตามนโยบาย
3. **Rooms**: ใช้ Room.number ที่มีจริงและ map เป็น roomNumber เฉพาะ API ถ้าตกลง; admin เขียน, receptionist อ่าน/ค้นหา; ห้าม CRUD เปลี่ยน occupied ข้าม operation; legacy room ต้อง backfill ก่อนจอง; ไม่ลบห้องที่มีประวัติ
4. **Guests**: admin/receptionist จัดการตาม role matrix; ค้นชื่อ/โทร/เลขเอกสาร; จำกัดการคืน documentNo ใน list/log/public; เก็บ audit และ archive แทนลบเมื่อมี booking
5. **ตรวจรับรวม**: unique/index/reference, pagination/filter, 401/403/404/409/validation, ข้อมูลเก่า, actor audit, seed idempotent และ rollback เมื่อ validation/transaction ล้มเหลว; ตรวจ API response ไม่มีข้อมูลลับ

## Task 3 — เปิด Booking API และพิสูจน์ความถูกต้องของการจองเดิม

**ผลลัพธ์:** พนักงานค้นหาห้องว่างและสร้าง/แก้/ยกเลิก/ค้น booking ผ่าน API ที่มี auth โดยไม่เกิด double booking

**Prompt สำหรับสั่ง AI**

~~~text
ตรวจ server/services/booking-validation.js, availability-service.js, booking-service.js และ tests เดิมก่อนแก้ ใช้ service เดิมเป็นฐาน ไม่เขียนกฎวันที่หรือ availability ซ้ำ ผูก HTTP route หลัง auth เท่านั้น และห้ามรับ actorId จาก client ทดสอบ race กับ MongoDB replica set ฐานแยก รวม create/update/cancel, rollback, index และ claims consistency ก่อนประกาศว่าเสร็จ
~~~

1. **ทบทวน invariant เดิม**: เทียบ schema, service, sample fixtures และ docs; พิสูจน์ unique (roomId, night), claims ของ confirmed/checked_in/checked_out และการลบของ cancelled; ตรวจกรณีข้อมูลเก่าที่มี booking แต่ไม่มี claims และวางวิธี backfill ก่อนเปิดจอง
2. **Availability API ภายใน**: รับวัน/จำนวนคนที่ถูกต้อง; filter active/type/capacity/status/claims; จำกัดช่วงและ pagination/ปริมาณผล; ตัดห้อง maintenance และ occupied ตาม PDF แม้ค้นช่วงอนาคต; หากต้องการกฎอื่นให้เปลี่ยนสเปกอย่างชัดเจนก่อนแก้ logic; response ไม่เผย PII
3. **Booking routes**: GET/list/detail, POST, PATCH, cancel; ใช้ actor จาก auth, validation และ error mapping ที่ตกลง; server คำนวณราคาเอง; ห้าม client ตั้ง status/totalPrice/audit fields
4. **Race/transaction และ payment guard**: ทดสอบคำขอชนกันอย่างน้อย create-create, edit-create, edit-edit, cancel-create; conflict ต้องได้ 409 และไม่เหลือ booking/payment/claims ครึ่งรายการ; ตรวจการแปล P2034 และ retry อย่างจำกัด, การคงราคา snapshot เมื่อแก้เฉพาะ guest/จำนวนคน และนโยบายคำนวณใหม่เมื่อเปลี่ยนวันหรือห้อง รวมทั้ง guard เมื่อรับเงินแล้ว
5. **ตรวจรับรวม**: HTTP tests ของสองบทบาท, overlap matrix, วันติดกัน/ปีอธิกสุรทิน, reference หาย, capacity, cancelled/rebook, test DB guard และ test rerun จากฐานสะอาด; เก็บผลจริงในเอกสาร

## Task 4 — Payment, Check-in/out และการเปลี่ยนสถานะร่วมกัน

**ผลลัพธ์:** ยอดเงินและสถานะ Booking/Room/Payment ตรวจย้อนกลับได้และไม่ขัดกัน

**Prompt สำหรับสั่ง AI**

~~~text
อ่าน Payment model และ booking guards เดิมก่อนออกแบบ Task 4 ตกลงก่อนว่าจะคง summary 1:1 หรือเพิ่มรายการรับ/คืนเงินแยกเพื่อ audit รายธุรกรรม ห้ามสร้าง endpoint ที่แก้ paidAmount/refundedAmount ตรง ๆ โดยไม่มีรายการอ้างอิงจริง ใช้ transaction และ state guard ทุก operation ทดสอบ rollback และการเรียกซ้ำ
~~~

1. **ล็อกแบบ payment**: ระบุหน่วยเงินบาท, amount/paid/refunded/net/remaining, วิธีรับเงินภายนอก, reference/idempotency, ประวัติผู้บันทึก; หากต้องรับหลายงวดหรือหลายวิธี ให้เพิ่ม ledger แล้วคำนวณ summary จากรายการจริง พร้อม migration plan
2. **รับเงิน/คืนเงินภายนอก**: route ตามสิทธิ์, amount > 0, ไม่รับเกิน/คืนเกิน, duplicate reference ไม่ลงซ้ำ, ไม่เก็บข้อมูลบัตร; cancel หลังจ่ายต้องมีขั้นตอนคืนเงินที่มองเห็นได้และไม่ทำให้ audit หาย
3. **Check-in**: confirmed เท่านั้น, วันท้องถิ่นโรงแรมตาม policy, room พร้อม; transaction เปลี่ยน Booking และ Room พร้อม actualCheckInAt/actor; ทดสอบคำขอซ้ำ/ห้อง maintenance/occupied
4. **Check-out**: checked_in และยอดสุทธิครบ; transaction เปลี่ยน Booking/Room พร้อม actualCheckOutAt/actor; ทดสอบยอดไม่ครบ, request ซ้ำ, room state ผิด และ rollback
5. **ตรวจรับรวม**: transition matrix ทั้งสถานะถูก/ผิด, partial payment/refund, concurrent operations, รายการเงินตรวจย้อนกลับได้, Room occupied สัมพันธ์กับ checked_in booking และไม่มี partial write

## Task 5 — Dashboard, Public API, Security, เอกสาร และส่งมอบ

**ผลลัพธ์:** backend พร้อมให้ frontend/ผู้ทดสอบใช้งาน และมีหลักฐานว่าแต่ละข้อกำหนดผ่านจริง

**Prompt สำหรับสั่ง AI**

~~~text
ปิด Task 5 หลัง Task 1–4 ผ่านเกณฑ์ ตรวจ dashboard และ public API จาก service เดียวกับ Booking, ทดสอบจาก client ภายนอกจริง ทำ OpenAPI/Postman/README ให้ตรง route และ schema ที่ deploy ได้ รัน test suite กับฐานแยกจากศูนย์ ตรวจ security, data migration, deployment และ demo flow อัปเดต audit register จากผลจริง ไม่เขียนว่า deploy/test ผ่านหากยังไม่มีหลักฐาน
~~~

1. **Dashboard**: count ห้องว่าง/occupied, booking วันนี้, checkout วันนี้ด้วย timezone และนิยามเดียวกัน; admin report เฉพาะข้อมูลที่กำหนดและตรวจตัวเลขกับ fixture
2. **Public Availability API**: ใช้ availability service เดิม, response เฉพาะ roomId/roomNumber/roomType/capacity/pricePerNight; ตัด guest/user/payment; กำหนด public หรือ API key, rate limit และ CORS ตาม consumer ที่ตกลง; ทดสอบ 401/429 หากใช้ key
3. **Hardening**: security headers, body/query limit, CSRF/cookie/CORS, redaction ของ password/token/documentNo, index/query performance, graceful shutdown/readiness; ตรวจ secret และ tracked dependency ใน Git
4. **เอกสาร**: OpenAPI, Postman, data model, env/seed/test/deploy guide, role matrix และ error examples; อัปเดต README, docs/step2-*, docs/step9-* และรายงานที่เกี่ยวข้องให้ระบุ “แผน/ทำแล้ว/ตรวจผ่าน” ถูกต้อง ไม่ใช้ผลทดสอบเก่าแทนผลปัจจุบัน
5. **ตรวจรับ backend**: ทดสอบ flow login → จัดการห้อง/guest → availability → booking → payment → check-in → check-out → dashboard → public API ผ่าน Supertest/Postman โดยไม่ต้องมี UI; CI รัน backend lint/test/schema validation; ทดสอบบน fresh clone/fresh test DB; เก็บ URL backend หรือวิธี local run, seed demo และ reviewer ตรวจ PR. **ส่งต่อทีม UI**: เมื่อ frontend พร้อมจึงเชื่อมทุก API, ตรวจ loading/empty/error/permission/responsive states, deploy frontend และซ้อม demo ทั้งระบบพร้อม slide/แผนสำรองตาม PDF

## Definition of Done — backend (ตรวจรับได้โดยไม่รอ frontend)

- Audit register ครอบคลุมไฟล์ทีมสร้างเองทุกไฟล์ และ requirement-to-evidence matrix บอกได้ว่าข้อไหนผ่าน, ไม่ผ่าน หรือยังตรวจไม่ได้
- API ทุกตัวมี server-side auth/role, validation, error contract, actor audit และไม่คืนข้อมูลลับ; service ที่รับ actorId ไม่เปิดทางให้ client ปลอมตัว
- Schema/index/ข้อมูลเก่า โดยเฉพาะ Room.number, collection Room และ RoomNightClaim ผ่านการตรวจและย้ายข้อมูลอย่างมี backup/rollback; ไม่มีการ push ฐานจริงโดยอาศัยแต่ sample fixture
- Booking create/edit/cancel และ race tests ผ่านกับ replica set จริงโดยไม่เหลือ claims หรือ payment ผิดสถานะ; check-in/out/payment ผ่าน transition และ rollback tests
- OpenAPI/Postman ตรง route จริง; Public API ไม่มี PII และทดสอบจาก HTTP client ภายนอก; flow ระบบผ่าน Supertest/Postman กับฐานทดสอบแยก
- Backend test suite, schema validation, seed, README, deployment guide, security checklist และ backend deploy/local run มีผลรันปัจจุบัน; reviewer อย่างน้อยหนึ่งคนตรวจ PR ก่อน merge

## เกณฑ์ปิด MVP ทั้งโครงการ (หลัง frontend พร้อม)

- Frontend เชื่อม API ตาม contract และผ่าน happy/error paths รวม responsive/loading/empty/permission states ตาม PDF
- Client lint/build และ deploy ผ่าน; frontend/backend URL ใช้งานร่วมกันได้จริง ตรวจ CORS/cookie กับ origin จริง
- มี demo flow, slide, seed ข้อมูลและแผนสำรอง local run; สาธิตครบตามเกณฑ์ใน PDF โดยไม่อ้างผล backend แทนผลของทั้งระบบ

## เรื่องที่ต้องตัดสินใจและบันทึกก่อนทำจุดที่เกี่ยวข้อง

1. Timezone โรงแรมและนโยบาย early/late check-in; สำหรับ availability ให้ยึดกฎ PDF ที่ตัด occupied/maintenance ออกจนกว่าจะอนุมัติเปลี่ยน
2. Session หรือ JWT, อายุ/revoke, frontend/backend origins, cookie, CORS และ CSRF
3. หน่วยราคา: คงจำนวนเต็มบาทตามโค้ดหรือย้ายทั้งระบบเป็นสตางค์ก่อนมีข้อมูลจริง
4. Validation HTTP status 400 หรือ 422 และ REST prefix; Public API ใช้ /api/public/rooms/availability ตาม PDF เว้นแต่ทีมอนุมัติ path ใหม่
5. Payment summary 1:1 หรือ ledger รายรับ/คืนเงิน, การจ่ายหลายงวด, refund/cancel policy
6. สิทธิ์ดูเลขเอกสาร guest และ retention/masking; ห้องและประเภทห้องให้ receptionist ดู/ค้นหา ส่วน admin จัดการตาม flow ใน PDF
7. Public API เปิดทั่วไปหรือใช้ API key, consumer/origin และ rate limit
8. ฐานข้อมูลเป้าหมายและแผน migration จาก Room เดิม; ห้ามเปลี่ยน Prisma/MongoDB หรือ collection โดยถือ PDF เป็นคำสั่ง
9. Frontend stack ที่จะส่งมอบจริง: PDF ระบุ Next.js/Tailwind/JavaScript แต่อีกแผนภาพกล่าวถึง React/EJS และ repo ปัจจุบันเป็น Vite/React/TypeScript; ให้ทีมเลือกก่อนเริ่มงาน UI
10. ระยะเวลา: ตาราง PDF ใช้หัวข้อ “1 สัปดาห์” แต่ส่วนความเสี่ยงกล่าวถึง “6 สัปดาห์”; ให้กำหนดวันเริ่ม/สิ้นสุดและ milestone จริงก่อนผูก deadline กับ Task

