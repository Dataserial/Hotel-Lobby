# Hotel-Lobby

## MongoDB และ Prisma

ฝั่ง `server` ใช้ Prisma 6 เชื่อมกับ MongoDB ในเครื่องที่ `127.0.0.1:27018` และฐานข้อมูล `hotel_lobby` โปรแกรม MongoDB Compass ใช้เปิดดูฐานข้อมูลเดียวกันด้วย connection string `mongodb://127.0.0.1:27018/?replicaSet=rs0` ส่วนแอปอ่าน `DATABASE_URL` จาก `server/.env` (ดูตัวอย่างที่ `server/.env.example`)

```powershell
cd server
npm install
npm run db:local
npm run db:push
npm start
```

แก้โมเดลใน `server/prisma/schema.prisma` แล้วรัน `npm run db:push` อีกครั้ง MongoDB กับ Prisma 6 ใช้ `db push` แทน `migrate dev` โค้ดใน `server/routes` เรียก Prisma Client ได้ด้วย `require('../lib/prisma')`

รัน `npm run db:local` หลังรีสตาร์ตเครื่องเพื่อเปิด MongoDB ของโปรเจกต์แบบ replica set `rs0` ที่พอร์ต `27018` ข้อมูลเก็บใน `server/.local-mongo/data` และแยกจาก MongoDB service เดิมที่พอร์ต `27017` คำสั่งนี้ใช้ MongoDB Server 8.0 ที่ติดตั้งไว้ใน `C:\Program Files\MongoDB\Server\8.0`
