# Hotel-Lobby: ER Diagram และ Use Case Diagram

จัดทำจาก schema และ API ในโปรเจกต์ ณ วันที่ 14 ตุลาคม 2026

## เปิดใน draw.io

เปิด https://app.diagrams.net แล้วเลือก **File → Open From → Device** และเปิด `hotel-lobby.drawio` หรือใช้ **File → Import From → Device** เพื่อนำเข้าในเอกสารเดิม

ไฟล์รวมมี 3 หน้าและแก้ไขกล่อง / เส้น / ข้อความได้:

1. **ER - All Models**: โมเดลทั้งหมด 14 โมเดล, scalar fields ทุกฟิลด์, unique keys และความสัมพันธ์หลัก 24 เส้น
2. **ER - Audit and Enums**: การอ้างอิง User ผ่าน createdById / updatedById อีก 10 เส้น และค่า enum ทั้งหมด
3. **Use Case - All Roles**: 34 use cases ของผู้เยี่ยมชม ลูกค้า พนักงานต้อนรับ และผู้ดูแลระบบ รวมงานย่อยที่ใช้ include

## คัดลอกโค้ด XML ไปวาง

สร้างหน้าเปล่าใน draw.io เลือก **Extras → Edit Diagram** แล้วแทนที่ XML เดิมด้วยเนื้อหาในไฟล์ที่ต้องการ จากนั้นกด **OK** / **Apply**:

- `er-diagram.xml`: ER หลัก
- `er-audit.xml`: ER เพิ่มเติมด้าน audit และ enum
- `usecase-diagram.xml`: Use Case Diagram ทั้งระบบ

XML แยกใช้ root `<mxGraphModel>` ซึ่งเหมาะกับเมนู Edit Diagram; ไฟล์รวม `hotel-lobby.drawio` ใช้ `<mxfile>` สำหรับการเปิด / นำเข้าไฟล์

คู่มือทางการ: [นำเข้าไฟล์](https://www.drawio.com/docs/manual/import/) และ [แก้ไข XML ของหน้า](https://www.drawio.com/docs/manual/advanced/diagram-source-edit/)

## ความหมายและขอบเขต

- ฐานข้อมูลจริงเป็น MongoDB + Prisma จึงใช้ชื่อโมเดลและ collection ตาม schema และไม่ได้สมมติว่า MongoDB บังคับ foreign keys แบบ SQL
- PK = primary key, UK = unique key, `?` = nullable, `[]` = array
- FK* / เส้นทึบ = ความสัมพันธ์ที่ประกาศด้วย Prisma `@relation`
- REF / เส้นประ = scalar ID ที่ application อ้างอิงเอง ไม่ได้ประกาศ `@relation`
- ตัวเลขบนเส้นระบุ cardinality เช่น `1 — 0..*` และ `0..1 — 0..*`
- ความสัมพันธ์ optional อ่านตาม schema แม้ flow ใหม่สร้างค่าครบ เช่น Booking มี Payment ได้ 0..1 ตาม schema
- AdditionalService.roomTypeIds เก็บ array ไม่ใช่ตารางเชื่อม; array ว่างหมายถึงใช้บริการได้กับทุกประเภทห้อง
- StayRequest และ StayRequestService เก็บชื่อ / ราคาขณะส่งคำขอเพื่อเป็น snapshot
- relatedBookingId เป็นฟิลด์ที่มีใน schema แต่ API ปัจจุบันยังไม่มีการแปลงคำขอเป็น Booking อัตโนมัติ
- CustomerBookingRequest ใช้ป้องกันการสร้างการจองซ้ำจากคำขอเดิม; RoomNightClaim ป้องกันการจองห้องเดียวกันคืนเดียวกัน
- AdminGuard เป็นเอกสารควบคุม concurrency ของการแก้บัญชี admin และไม่มี relation กับโมเดลอื่น
- Use case การรับเงินหมายถึงพนักงานบันทึกหลักฐาน ไม่ได้มีระบบ payment gateway
- ลูกค้าดู / จอง / แก้ profile / ส่งคำขอได้เฉพาะสิทธิ์ของตน; API ปัจจุบันไม่มีให้ลูกค้ายกเลิกการจองเอง
- พนักงานต้อนรับและผู้ดูแลระบบสืบทอด use cases จาก actor พนักงานโรงแรม `{abstract}`; admin มีสิทธิ์จัดการ master data / ผู้ใช้ / รายงานเพิ่ม
- การเช็คเอาต์ include การตรวจยอดสุทธิครบ; ไม่ได้ include การรับเงิน เพราะ booking อาจจ่ายครบก่อนเช็คเอาต์แล้ว
- CRUD ที่มีหลาย endpoint รวมเป็น use case จัดการข้อมูล เพื่อให้อ่านแผนภาพได้ง่าย

## แหล่งอ้างอิงในโปรเจกต์

| ส่วน | โค้ดต้นทาง |
| --- | --- |
| โมเดล / fields / enums / unique constraints | `server/prisma/schema.prisma` |
| API boundary และสิทธิ์ staff / customer | `server/app.js`, `server/lib/auth.js` |
| สมัคร / login / profile / logout | `server/routes/api-auth.js` |
| จองโดยลูกค้า / ประวัติของตน | `server/routes/api-customer-bookings.js` |
| คำขอเข้าพัก / บริการที่เลือก / เปลี่ยนสถานะ | `server/routes/api-stay-requests.js` |
| จองโดยพนักงาน / แก้ไข / ยกเลิก | `server/routes/api-bookings.js`, `server/services/booking-service.js` |
| รับเงิน / คืนเงิน / ประวัติ / check-in / check-out | `server/routes/api-operations.js`, `server/services/payment-service.js`, `server/services/stay-service.js` |
| Dashboard / รายงาน | `server/routes/api-dashboard.js`, `server/services/dashboard-service.js` |
| ห้อง / ประเภท / ผู้เข้าพัก / ผู้ใช้ / บริการ | `server/routes/api-rooms.js`, `api-room-types.js`, `api-guests.js`, `api-users.js`, `api-additional-services.js` |
| Public information / ติดต่อ | `client/src/PublicHotel.tsx`, `client/src/HotelContact.tsx` |
| ข้อมูลห้องสาธารณะ / ค้นหาว่าง | `server/routes/api-public-*.js`, `server/routes/api-availability.js` |

ไฟล์ `er-diagram.mmd` เป็น Mermaid ER ทางเลือกสำหรับ **Arrange → Insert → Advanced → Mermaid**; ใช้ XML เป็นฉบับหลักเพราะแสดง nullable fields, compound unique keys และ audit supplement ครบกว่า

ตรวจแล้วว่า XML อ่านได้, IDs ไม่ซ้ำ, endpoints ของทุกเส้นมีอยู่ และ ER ครอบคลุมทุกโมเดล / scalar fields ใน schema การตรวจนี้เป็น structural validation ไม่ใช่ผลทดสอบการเรนเดอร์ในเว็บ draw.io

สร้างไฟล์ใหม่จาก schema ได้โดยรัน `python docs/diagrams/generate_diagrams.py` จาก root โปรเจกต์ โครงวางตำแหน่งและความสัมพันธ์ใน generator ต้องอัปเดตด้วยเมื่อเปลี่ยนโมเดล
