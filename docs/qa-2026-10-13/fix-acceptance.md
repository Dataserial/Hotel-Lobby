# ผลแก้ไขและตรวจรับ — 13 ตุลาคม 2026

รายงานเดิม `report.md` และ `evidence.json` เป็นหลักฐานก่อนแก้ที่ commit
`7a7a777` ไม่ได้ถูกเขียนทับ ไฟล์ `final-backend-verification.log` ที่ commit
ในรอบ homepage เป็น log รอบก่อนที่ไม่ครบทุกกลุ่ม ไม่ใช่ผลตรวจสุดท้ายนี้

## ประเด็นเดิม

| ID | ผลแก้ไข |
| --- | --- |
| A01 | จำกัดรหัสผ่านใหม่ ≥12 ตัวอักษร และ ≤72 UTF-8 bytes ป้องกัน bcrypt truncation |
| A02 | Login ไม่ trim รหัสผ่าน เก็บช่องว่างตามที่ตั้งจริง |
| A03 | เปลี่ยนรหัสผ่านเพิกถอน sessions และ serialize กับการออก session ใหม่ |
| A04 | รับ trusted proxy เฉพาะ IP/CIDR ที่ระบุชัด ไม่รับ true/hop count/ทั่วโลก; topology จริงต้องตรวจบน staging |
| A05 | ปิด/เปลี่ยน booking detail แล้วไม่รับข้อมูลหรือผล action เก่ามาเปิดทับ |
| A06 | List ยกเลิก/เพิกเฉย request เก่า ไม่เขียนทับข้อมูล error หรือ loading ของคำขอใหม่ |
| A07 | occupied เปิดจองหลังวันออกอนาคตที่ชัดเจน; due/overdue/ข้อมูลกำกวมยังปิด และ check-in จริงตรวจห้องพร้อม |
| A08 | staff edit ยกเว้นเฉพาะ claims ของ confirmed booking ตัวเอง; public ไม่รับ excludeBookingId |
| A09 | ค้นหา/แบ่งหน้า guest, room type, users, receipts, payment history และ room choices; resolve references ด้วย ID |
| A10 | occupied editor บันทึกเฉพาะ metadata ที่เปลี่ยน ไม่ส่ง type/status/active ที่ล็อกไว้ |
| A11 | floor 0 ไม่เปลี่ยนเป็น 1 |
| A12 | ใช้ช่องทางติดต่อจาก env ที่ตรวจรูปแบบแล้ว; ถ้ายังไม่ตั้งแสดง unavailable ไม่สร้างข้อมูลสมมติ |
| A13 | ตรวจ JSON/content type/schema และ 204 ตาม semantics ปฏิเสธ HTML/ข้อมูลผิดรูปแบบ |
| A14 | timeout/cancel ชัดเจน; ไม่ retry write อัตโนมัติ รายการเงินส่งซ้ำด้วย key/ข้อมูลเดิม |
| A15 | ปรับ contrast ข้อความรอง และตรวจ token สีด้วย tests |
| A16 | แยก initial-admin bootstrap จาก local demo seed; ตรวจชื่อฐานตรง ไม่ reset account; แก้ deploy guide |
| A17 | dashboard เปิด booking ด้วย ID ที่เลือกจริง |

ค่า `ALLOW_FUTURE_OCCUPIED_BOOKINGS=true` เป็น default ที่เลือกสำหรับ A07;
ตั้ง false หากโรงแรมต้องการปิดการจองอนาคตของ occupied ทั้งหมด
ช่องทางติดต่อจริงและ ingress proxy CIDRs ยังต้องตั้งจากข้อมูลโรงแรม/ผู้ให้บริการ
ไม่ได้ deploy, seed หรือแก้ข้อมูลโรงแรมจริงในการตรวจครั้งนี้

## งานเพิ่มเติม

- สมัครสมาชิก customer, login/logout, แก้ชื่อ/อีเมล และแสดง identity ที่หน้าโรงแรม
- หน้าแรก `/` แนะนำเว็บ วิธีใช้งาน FAQ ประเภทห้อง ราคา และ inventory คืนนี้จาก API จริง
- โลโก้หน้าแรก/ค้นหา/login/member/staff กลับ home โดยรักษา session
- แอนิเมชันปุ่ม หน้า/หน้าต่าง และ scroll reveal มี reduced-motion, keyboard และ cleanup
- หน้าสมัครสมาชิกใหม่ใช้ภาพแนะนำคู่กับฟอร์ม อ่านง่าย และยุบเป็นคอลัมน์เดียวบนมือถือ
- หน้าแรกแยกสี cream, pale blue, white และ navy เพื่อแบ่ง section
- profile response เก่าไม่คืนชีพ session ที่ logout หรือทับบัญชีใหม่

## CI ที่ผู้ใช้แจ้งล้ม

[GitHub run 38408900909](https://github.com/Dataserial/Hotel-Lobby/actions/runs/38408900909)
ของ commit `287642e` มี backend suites ผ่าน แต่ job รวมชื่อ Backend validation
ล้มที่ `client npm test`: 2 tests ของ overview date/checkOutDate คาดหวังให้
ปฏิเสธ `not-a-date` แต่ source ยังไม่ได้แก้ ตัวตรวจใหม่เช็ก YYYY-MM-DD และ
UTC ISO round-trip จึงปฏิเสธวันผิดรูปแบบ/วันไม่มีจริงได้ Tests เดิมทั้งสองผ่าน
แล้วใน local ไม่มีการลด/ข้าม quality gate หรือเปลี่ยน tests ให้ยอมรับบั๊ก

## ผลรันสุดท้าย

| การตรวจ | ผลจริง |
| --- | --- |
| Client `npm test` | 35 passed, 0 failed |
| Client lint + TypeScript/Vite build | exit 0 |
| Server `npm run test:all:isolated` | exit 0 ทุกกลุ่ม; กลุ่มสุดท้าย 9 suites / 24 tests ผ่าน |
| Server lint + Prisma validate | ผ่าน |
| npm audit ของ client และ server | 0 vulnerabilities ณ เวลาตรวจ |
| OpenAPI YAML parsing | ผ่านทุกไฟล์ |
| Independent final frontend review | passed; reviewer รัน targeted 15 tests ผ่าน |
| Independent overview/bootstrap backend review | passed; source review ไม่มี blockers |
| HTTP `/ready` และ Vite `/` | ready / 200 |

Tests ใช้ replica sets ชั่วคราวแยกฐานจริง; client DOM integration เรียก HTTP
และ DB จริง ทดสอบ signup → profile → hotel → logout → relogin, home routing,
logo, session races, และ inventory ที่เปลี่ยนเมื่อจอง/maintenance/เปลี่ยนราคา

เคยตรวจ screenshot/การคลิกบนเบราว์เซอร์จริงของ homepage ก่อนปรับ signup และ
section colors รอบสุดท้าย หลัง runtime เปลี่ยน browser inventory ว่าง จึง
ไม่มี screenshot ตรวจภาพรอบสุดท้าย ไม่อ้างว่าตรวจภาพใหม่แล้ว การทำงานรอบ
สุดท้ายตรวจด้วย React DOM, HTTP, build และ review ข้างต้น

## ตัวอย่าง local

- หน้าแรก: http://127.0.0.1:5173/
- สมัครสมาชิก: http://127.0.0.1:5173/#register
- ระบบพนักงาน: http://127.0.0.1:5173/#staff
- API readiness: http://127.0.0.1:3000/ready

ใช้ฐาน `hotel_lobby_local_demo` แยกจากโรงแรมจริง มี 9 ห้อง / 3 ประเภท;
ราคาเริ่มต้น 1,200 บาทต่อคืน จำนวนว่าง/จองเป็นค่าที่อ่านจาก API ไม่ hardcode
Admin credentials ส่ง Telegram แล้วในรอบก่อน ไม่บันทึกลงรายงานหรือ git

การตรวจ CI บน GitHub ของ commits ใหม่ต้องรันหลัง push; ไม่ถือว่า local ผ่าน
เท่ากับ remote checks ผ่าน และไม่ push/deploy โดยอัตโนมัติจากคำขอ commit
