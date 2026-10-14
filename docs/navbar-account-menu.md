# Floating navbar และเมนูบัญชี

- ข้อความ `INVALID_CREDENTIALS` แสดงเฉพาะ “อีเมลหรือรหัสผ่านไม่ถูกต้อง”
  โดยเก็บ request ID ใน error object สำหรับ diagnostics ตามเดิม
- บัญชีบน navbar แสดงวงกลมชื่อย่อ เปิด dropdown ที่มีชื่อ/อีเมล สถานะ login,
  บัญชีสมาชิก และออกจากระบบ บัญชีพนักงานใช้ลิงก์ระบบพนักงานตามสิทธิ์เดิม
- รองรับ Enter/Space, Arrow keys, Home/End, Escape, Tab และคลิกนอกเพื่อปิด
- Navbar หน้าแรก ค้นหาห้อง บัญชีสมาชิก login/register และระบบพนักงานใช้
  `floating-navbar`: กรมท่า ขอบมน มีระยะจากขอบจอ และ `position: sticky`
- Header หน้าค้นหาห้องเป็นลูกตรงของ main เพื่อไม่หยุดติดตามเมื่อผ่านส่วน
  discover ไปยังผลค้นหา Sidebar พนักงานติดตามบน desktop; mobile มี topbar
  ติดตามและเมนูด้านข้างแสดงเป็นแถบปกติเพื่อลดพื้นที่ที่บังเนื้อหา
- Navbar z-index ต่ำกว่า modal; dropdown มี animation พร้อม reduced-motion
- Logo ทุก header ยังคงกลับ home โดยไม่ logout

Source: `AccountMenu.tsx`, `Navbar.css` และการเชื่อมต่อในแต่ละหน้า
Regression tests ใช้ React DOM + HTTP/Mongo สำหรับข้อความ login ผิด,
member/staff navigation, dropdown actions และ session races

CSS sticky/layout ไม่ได้รับการยืนยันด้วย screenshot รอบนี้ เนื่องจาก browser
connector ไม่มี browser ที่ใช้งานได้; การตรวจพฤติกรรมเป็น DOM tests และ build
