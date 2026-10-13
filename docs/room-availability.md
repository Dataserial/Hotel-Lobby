# สรุปประเภทห้องและวันว่าง — 14 ตุลาคม 2026

หน้า `/#discover` แสดงแผง **ห้องไหนว่างสำหรับคุณ?** ใต้ฟอร์มค้นหาโดยอัตโนมัติ
ครั้งแรกตรวจคืนนี้สำหรับ 2 คน หลังค้นหาใช้วันที่/จำนวนคนที่ค้นหาจริง
การแก้ค่าในฟอร์มยังไม่เปลี่ยน snapshot จนกดค้นหา; วันที่ที่แผงแสดงเป็นช่วง
ที่ตรวจล่าสุดเสมอ กดอัปเดตห้องว่างเพื่ออ่านใหม่ได้

## ข้อมูลใน UI

- ภาพประกอบ ชื่อประเภทห้อง ความจุสูงสุดต่อห้อง และจำนวนห้องที่เหลือ
- ความจุรวมของห้องว่าง โดยระบุชัดว่าต้องแบ่งพักหลายห้อง
- ราคาบาทต่อห้องต่อคืน และราคารวมตามจำนวนคืนที่เลือก
- ตรวจวันเริ่มพักสูงสุด 14 วัน รวมวันเข้าเดิมและอีก 13 วันถัดไป แบ่งแสดงครั้งละ 7 วัน
- ทุกช่องตรวจว่าห้องเดิมว่าง **ครบทุกคืน** ไม่รวมวันเช็กเอาต์
- กดวันที่ที่มีห้องว่างเพื่อเติมวันเข้า–ออก และค้นหาห้องจริงใหม่
- ประเภทที่ไม่รองรับจำนวนคนมีคำอธิบาย ไม่แสดงว่าจองได้
- ข้อมูลผิดรูปแบบ/เครือข่ายล้มเหลวมีสถานะ error และ retry ไม่แทนด้วยเลข 0
- ฐานที่ไม่มี inventory แสดงว่าไม่มีประเภทเปิดใช้งาน ไม่สร้างห้องสมมติ

วันและจำนวนห้องเป็นข้อมูล snapshot ไม่ใช่การล็อกห้อง การติดต่อพนักงานยัง
ไม่สร้าง booking หรือชำระเงิน การพักหลายห้องต้องยืนยันกับโรงแรม

## ภาพที่ผู้ใช้ให้มา

ไฟล์ต้นฉบับถูกคัดลอกโดยไม่แก้ภาพ:

| ภาพ | ไฟล์ | การจับคู่เริ่มต้น |
| --- | --- | --- |
| เตียงโทนน้ำตาล | `client/public/rooms/standard.png` | Standard / ชื่ออื่นที่ยังไม่กำหนดภาพ |
| เตียงคู่พร้อมวิวเมือง | `client/public/rooms/deluxe.png` | ชื่อมี Deluxe / ดีลักซ์ |
| หัวเตียงสีฟ้าและโซฟา | `client/public/rooms/family.png` | ชื่อมี Family / ครอบครัว |

การจับคู่อยู่ใน `client/src/roomPhotos.ts` และมีคำว่า **ภาพประกอบ** ใน UI
เนื่องจากภาพไม่ได้ระบุชื่อประเภทจริง ไม่อนุมานความจุ/ราคา/จำนวนห้องจากภาพ
ข้อมูลเหล่านั้นอ่านจากฐานข้อมูล รูปเดียวกันแสดงบนผลค้นหาห้องจริง

## API

`GET /api/public/rooms/summary?checkInDate=YYYY-MM-DD&checkOutDate=YYYY-MM-DD&guestCount=2`

Public read-only, rate limit, `Cache-Control: no-store`, ไม่รับ query อื่น
เช่น `excludeBookingId`. วันจริง ช่วง 1–365 คืน และจำนวนคน 1–20 ใช้ validator
เดียวกับ booking. Response:

```text
checkInDate, checkOutDate, guestCount, nights, previewDays,
timezone, updatedAt, totalAvailableRooms,
roomTypes[{id,name,capacity,pricePerNight,amenities,totalRooms,availableRooms,
  dates[{checkInDate,checkOutDate,availableRooms}]}]
```

ภายใน transaction อ่าน active room/type, occupants และ claims อย่างละชุด
แล้วคำนวณวันทางเลือกด้วย policy `roomBookable` เดิม ห้อง maintenance/inactive,
occupied ที่ due/overdue หรือข้อมูลกำกวม ไม่เปิดจอง มี occupancy cache เฉพาะ
snapshot นี้ ไม่ข้าม claims ของใคร ไม่มี guest/payment/booking identifiers
หรือ room numbers ใน response. `totalRooms` รวมห้อง active ที่ maintenance;
`availableRooms` นับเฉพาะห้องที่รองรับจำนวนคนและจองได้ครบช่วง

ช่วงใกล้ปี 9999 ตัดจำนวนวันทางเลือกลงเพื่อไม่สร้างวันที่เกินขอบเขต
การกดวันทางเลือกยังตรวจ availability จริงซ้ำผ่าน endpoint เดิม

## การตรวจรับ

- Real Mongo + HTTP: booking คืนใดคืนหนึ่งตัดห้องออกจากทั้ง stay, คืนวันออก
  จองต่อได้, ทางเลือกทุกวันตรงกับ service เดิม, capacity, empty inventory,
  invalid dates/unknown query และ occupied future/due policy
- Real React DOM + HTTP + Mongo: เปิดหน้าเห็น summary ก่อนกดค้นหา, ภาพ/ชื่อ/
  จำนวน/ราคา, กดวันทางเลือกแล้วเติมฟอร์มและค้นใหม่ พร้อมเปิด contact dialog
- New test file ลงทะเบียนใน `server/scripts/test-all-isolated.js` แล้ว
- รูปแบบ responsive ใน CSS รองรับ desktop / 2 columns / mobile 1 column;
  DOM tests ไม่ใช่หลักฐานยืนยันภาพ layout ในเบราว์เซอร์

เปิดตัวอย่าง local: http://127.0.0.1:5173/#discover
