# วิธีรัน Hotel-Lobby แบบ Local

คู่มือนี้ใช้ **PowerShell บน Windows** และโฟลเดอร์โปรเจกต์:

```text
C:\Users\Administrator\Desktop\Hotel-Lobby
```

## 1. ส่วนประกอบและพอร์ต

| ส่วน | หน้าที่ | พอร์ต |
| --- | --- | --- |
| MongoDB | ฐานข้อมูล local แบบ replica set `rs0` | 27018 |
| Backend (`server`) | API ของระบบโรงแรม | 3000 |
| Frontend (`client`) | เว็บ React/Vite | 5173 |

ต้องมี Node.js/npm และ MongoDB binary ก่อนเริ่มใช้งาน CI ของโปรเจกต์ใช้ Node.js 24
ตรวจ Node/npm ด้วย:

```powershell
node --version
npm --version
```

## 2. ตั้งค่า `.env`

เครื่องนี้มี `server/.env` สำหรับฐาน local อยู่แล้ว **ไม่ต้องสร้างใหม่หรือเขียนทับ**
ถ้าเป็นการตั้งค่าเครื่องใหม่ ให้สร้าง `server/.env` โดยใช้ค่าดังนี้:

```dotenv
DATABASE_URL="mongodb://127.0.0.1:27018/hotel_lobby_local_demo?replicaSet=rs0"
CORS_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
PUBLIC_CORS_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
PORT=3000
HOST=127.0.0.1
TRUSTED_PROXY_CIDRS=
ALLOW_FUTURE_OCCUPIED_BOOKINGS=true
```

ใช้ URL local ข้างต้น ไม่ใช้ URL ของ Atlas สำหรับขั้นตอนสร้าง/seed ฐานทดลอง
ไม่ต้องใส่รหัสผ่าน Admin ลงในคู่มือนี้

Frontend ที่รันผ่าน Vite ส่ง `/api` ไป backend ที่ `http://localhost:3000`
จึงไม่ต้องตั้ง `VITE_API_BASE_URL` สำหรับ local หาก `client/.env` ตั้งตัวแปรนี้
ไปยัง API ที่ deploy ไว้ ให้ลบ/คอมเมนต์ค่านั้นเพื่อใช้ proxy local แล้ว restart Vite

## 3. ติดตั้ง dependencies — ครั้งแรกหรือเมื่อเปลี่ยน dependencies

**หยุด backend และ frontend ที่กำลังรันก่อน** โดยกด `Ctrl+C` ใน terminal ของแต่ละส่วน
ไม่ต้องติดตั้งซ้ำทุกครั้งที่เปิดโปรแกรมหรือแก้ไฟล์ source

### Backend

```powershell
cd C:\Users\Administrator\Desktop\Hotel-Lobby\server
npm ci
```

`npm ci` ของ backend เรียก `prisma generate` ให้อัตโนมัติผ่าน `postinstall`

### Frontend

```powershell
cd C:\Users\Administrator\Desktop\Hotel-Lobby\client
npm ci
```

## 4. รันใช้งานตามปกติ — เปิด PowerShell 2 หน้าต่าง

### หน้าต่างที่ 1: MongoDB และ Backend

```powershell
cd C:\Users\Administrator\Desktop\Hotel-Lobby\server

# ตำแหน่ง MongoDB binary ที่มีอยู่ในเครื่องนี้
$env:MONGOD_PATH = "C:\Users\Administrator\.cache\mongodb-binaries\mongod-x64-win32-8.2.6.exe"
npm run db:local
if ($LASTEXITCODE -ne 0) { throw "เริ่ม MongoDB ไม่สำเร็จ" }

$env:HOST = "127.0.0.1"
npm start
```

`db:local` เปิด MongoDB เบื้องหลังบนพอร์ต 27018 และตั้ง replica set `rs0`
หากตัวเดิมรันอยู่แล้วจะตรวจความพร้อม ไม่เปิด MongoDB ซ้ำ
หากใช้เครื่องอื่น ให้เปลี่ยน `MONGOD_PATH` ให้ตรงกับ `mongod.exe` ที่ติดตั้ง

เมื่อ backend พร้อม จะเห็นข้อความ:

```text
Backend listening on port 3000; readiness: http://localhost:3000/ready
```

ปล่อย terminal นี้รันค้างไว้

### หน้าต่างที่ 2: Frontend

```powershell
cd C:\Users\Administrator\Desktop\Hotel-Lobby\client
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

ปล่อย terminal นี้รันค้างไว้เช่นกัน เปิดเว็บที่ **http://127.0.0.1:5173/**

| หน้า | URL |
| --- | --- |
| หน้าแรก | http://127.0.0.1:5173/ |
| ค้นหาห้องพัก | http://127.0.0.1:5173/#discover |
| สมัครสมาชิก | http://127.0.0.1:5173/#register |
| บัญชีสมาชิก / Login | http://127.0.0.1:5173/#member |
| ระบบพนักงาน / Admin | http://127.0.0.1:5173/#staff |
| API readiness | http://127.0.0.1:3000/ready |

## 5. เมื่อแก้โค้ด ต้องรันใหม่ไหม?

| สิ่งที่แก้ | สิ่งที่ต้องทำ |
| --- | --- |
| `client/src` เช่น TSX/CSS | บันทึกไฟล์แล้ว Vite อัปเดตให้อัตโนมัติ โดยทั่วไปไม่ต้อง restart |
| Backend ใน `server` | กด `Ctrl+C` ที่ terminal backend แล้วรัน `npm start` ใหม่ |
| `.env` หรือ config | Restart ส่วนที่เกี่ยวข้อง |
| `schema.prisma` | หยุด backend แล้วรัน `npm run db:generate`; หากเปลี่ยนโครงสร้างฐาน ให้จัดการ schema ของฐานทดลองแยกต่างหากก่อนเปิด backend |
| เพิ่ม/แก้ dependency | หยุดส่วนที่เกี่ยวข้อง ติดตั้ง package ด้วย `npm install ...` แล้วรันใหม่ |
| ดึงโค้ดที่มี `package-lock.json` เปลี่ยน | หยุดส่วนที่เกี่ยวข้อง แล้วรัน `npm ci` ในโฟลเดอร์นั้น |

**การแก้ source ปกติไม่ต้องรัน `npm ci` ใหม่**
การรีเฟรชหน้าเว็บจะทำให้ต้อง login ใหม่ เนื่องจาก token เก็บในหน่วยความจำของแท็บ

## 6. หยุดโปรแกรม

- Backend: กด `Ctrl+C` ใน terminal ที่รัน `npm start`
- Frontend: กด `Ctrl+C` ใน terminal ที่รัน Vite
- MongoDB ที่เปิดด้วย `db:local` เป็น process เบื้องหลัง ไม่หยุดตาม backend
  สามารถปล่อยไว้สำหรับการพัฒนารอบต่อไปได้
- ข้อมูล MongoDB local อยู่ใน `server/.local-mongo/data` การหยุด backend ไม่ลบข้อมูล

ถ้า terminal ที่เปิด backend ถูกเปิดโดย AI/เครื่องมืออื่น ให้หยุดผ่านเครื่องมือนั้น
ก่อนติดตั้ง dependencies ใหม่; `Ctrl+C` ใน terminal คนละหน้าต่างจะไม่หยุด backend ตัวนั้น

## 7. แก้ปัญหาที่พบบ่อย

### `npm ci` ขึ้น EPERM ที่ `query_engine-windows.dll.node`

กรณีที่ตรวจพบในเครื่องนี้เกิดจาก backend กำลังโหลด Prisma DLL อยู่
Windows จึงไม่ยอมให้ `npm ci` ลบ/แทนที่ไฟล์

1. หยุด backend ตัวที่กำลังใช้งานจริงก่อน
2. ตรวจพอร์ตเพื่อหาตัวที่ยังรันอยู่:

   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
     Select-Object LocalAddress, LocalPort, OwningProcess
   ```

3. เมื่อ backend หยุดแล้ว รัน:

   ```powershell
   cd C:\Users\Administrator\Desktop\Hotel-Lobby\server
   npm ci
   if ($LASTEXITCODE -ne 0) { throw "ติดตั้ง dependencies ไม่สำเร็จ" }
   npm start
   ```

ไม่ต้องลบฐานข้อมูลหรือหยุด Node ทุก process ในเครื่อง หากยังล็อกหลังหยุด backend
ให้ตรวจ process ของโปรเจกต์ที่รัน tests/Prisma ค้างอยู่ก่อนลองติดตั้งใหม่

### พอร์ต 3000 หรือ 5173 ถูกใช้งาน

มักมี backend/Vite เดิมรันอยู่แล้ว ให้เปิด URL เดิมหรือหยุดตัวเดิมก่อนเปิดใหม่
`--strictPort` ป้องกัน Vite เปลี่ยนพอร์ตเงียบ ๆ จน origin ไม่ตรงกับ CORS

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,5173 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

### MongoDB Server not found หรือ `/ready` ไม่พร้อม

- ตรวจว่าไฟล์ใน `MONGOD_PATH` มีอยู่จริง
- รัน `npm run db:local` ใน `server` และอ่านข้อความผิดพลาด
- ตรวจ `DATABASE_URL` ว่าชี้ `127.0.0.1:27018` และมี `replicaSet=rs0`
- Log MongoDB อยู่ที่ `server/.local-mongo/mongod.log`

### `package.json` อ่านไม่ได้ / มี merge conflict

ตรวจและแก้บล็อก `<<<<<<<`, `=======`, `>>>>>>>` ให้เหลือ JSON ที่ถูกต้อง
ก่อนรัน npm เก็บ script ที่ต้องใช้ไว้ ไม่ลบ dependency เพื่อหลบปัญหา

### เว็บเปิดได้แต่ไม่มีห้องพัก

ข้อมูลอาจยังไม่มีในฐานที่เลือก UI จะแสดงตามฐานจริง ไม่สร้างห้องขึ้นเอง
ไม่ต้อง seed ทุกครั้งที่เปิดเว็บ หากเป็นฐานทดลองว่างใหม่ ดูหัวข้อถัดไป

## 8. สร้างข้อมูล Demo — เฉพาะฐาน local ทดลองว่างใหม่

**ข้ามหัวข้อนี้หากใช้ฐาน local ที่เตรียมไว้แล้ว** มีบัญชีและห้อง demo อยู่แล้ว
คำสั่งนี้สร้าง schema/indexes และข้อมูล ไม่ใช่ขั้นตอนเปิดโปรแกรมตามปกติ

หยุด backend ก่อน และใช้เฉพาะฐานทดลอง local ที่ยืนยันว่าเป็นฐานใหม่:

```powershell
cd C:\Users\Administrator\Desktop\Hotel-Lobby\server
$env:MONGOD_PATH = "C:\Users\Administrator\.cache\mongodb-binaries\mongod-x64-win32-8.2.6.exe"
npm run db:local
if ($LASTEXITCODE -ne 0) { throw "เริ่ม MongoDB ไม่สำเร็จ" }

# ตั้งเฉพาะ process นี้ให้ชี้ฐานทดลอง local ที่แยกไว้
$env:DATABASE_URL = "mongodb://127.0.0.1:27018/hotel_lobby_new_demo?replicaSet=rs0"
npm run db:push
if ($LASTEXITCODE -ne 0) { throw "สร้าง schema ไม่สำเร็จ" }

$env:DEMO_ADMIN_EMAIL = Read-Host "อีเมล Admin สำหรับฐานทดลองใหม่"
$demoPassword = Read-Host "รหัสผ่านใหม่ อย่างน้อย 12 ตัวอักษร ไม่เกิน 72 ไบต์ UTF-8" -AsSecureString
$env:DEMO_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $demoPassword).Password
npm run db:seed:demo
$seedExitCode = $LASTEXITCODE
Remove-Item Env:\DEMO_ADMIN_PASSWORD
if ($seedExitCode -ne 0) { throw "สร้าง Demo ไม่สำเร็จ" }
```

Demo seed สร้าง Admin 1 บัญชีและห้อง 9 ห้อง / 3 ประเภท ไม่ใช่เครื่องมือ reset รหัสผ่าน
หากต้องการใช้ฐานใหม่นี้ในครั้งถัดไป ให้แก้ `DATABASE_URL` ใน `server/.env`
เป็น `hotel_lobby_new_demo` ด้วย การตั้ง `$env:` มีผลเฉพาะ terminal ปัจจุบัน

## 9. ตรวจว่าโปรแกรมพร้อมใช้งาน

เมื่อทั้งสองส่วนรันอยู่ ใช้ PowerShell อีกหน้าต่าง:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/ready
(Invoke-WebRequest http://127.0.0.1:5173/ -UseBasicParsing).StatusCode
```

ควรได้ `status: ready` และ HTTP `200`

สำหรับตรวจโค้ดเพิ่มเติม:

```powershell
# Frontend
cd C:\Users\Administrator\Desktop\Hotel-Lobby\client
npm run lint
npm test
npm run build

# Backend
cd C:\Users\Administrator\Desktop\Hotel-Lobby\server
npm run lint
npx prisma validate
$env:MONGOD_PATH = "C:\Users\Administrator\.cache\mongodb-binaries\mongod-x64-win32-8.2.6.exe"
npm run test:all:isolated
```

Tests แบบ isolated ใช้ฐานชั่วคราวแยกจากฐาน local demo ไม่ต้อง seed ก่อนทดสอบ
การเปิด local ไม่ใช่การ deploy; เว็บบน Vercel/Render ไม่เปลี่ยนตาม local โดยอัตโนมัติ
