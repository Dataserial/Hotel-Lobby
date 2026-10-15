// เปิด API และฐานข้อมูลแยกสำหรับทดลองใน Postman
// ระบบทดลอง Postman ใช้ฐานแยกของตัวเอง ไม่เลือกฐานจาก DATABASE_URL
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { MongoClient } = require('mongodb');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, '.local-mongo', 'postman-demo');
const url = 'mongodb://127.0.0.1:27019/hotel_lobby_postman_demo?replicaSet=postmanDemo';
const ids = { user: '100000000000000000000001', type: '200000000000000000000001',
  room: '300000000000000000000001', guest: '400000000000000000000001' };
let mongoProcess;
let prisma;
let server;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
  const client = new MongoClient('mongodb://127.0.0.1:27019/?directConnection=true', { serverSelectionTimeoutMS: 1000 });
  try { await client.connect(); return client; }
  catch (error) { await client.close(); throw error; }
}

async function mongoReady() {
  let client;
  try { client = await connect(); } catch { /* เริ่ม MongoDB แยกสำหรับการทดลองนี้ */ }
  if (!client) {
    const binaries = [process.env.POSTMAN_MONGOD_PATH,
      path.join(process.env.USERPROFILE || '', '.cache', 'mongodb-binaries', 'mongod-x64-win32-8.2.6.exe'),
      'C:/Program Files/MongoDB/Server/9.0/bin/mongod.exe'].filter(Boolean);
    const binary = binaries.find(file => fs.existsSync(file));
    if (!binary) throw new Error('No local MongoDB binary found; set POSTMAN_MONGOD_PATH.');
    fs.mkdirSync(dataPath, { recursive: true });
    mongoProcess = spawn(binary, ['--dbpath', dataPath, '--port', '27019', '--bind_ip', '127.0.0.1',
      '--replSet', 'postmanDemo', '--logpath', path.join(dataPath, 'mongod.log'), '--logappend'],
    { windowsHide: true, stdio: 'ignore' });
    let spawnError;
    mongoProcess.on('error', error => { spawnError = error; });
    for (let i = 0; i < 45 && !client; i++) {
      if (spawnError) throw spawnError;
      if (mongoProcess.exitCode !== null) throw new Error('Demo MongoDB exited; inspect mongod.log.');
      try { client = await connect(); } catch { await sleep(500); }
    }
    if (!client) throw new Error('Demo MongoDB startup timed out.');
  }
  try {
    const admin = client.db('admin');
    const hello = await admin.command({ hello: 1 });
    if (hello.setName && hello.setName !== 'postmanDemo') throw new Error('Port 27019 belongs to another replica set.');
    if (!hello.setName) {
      if (!mongoProcess) throw new Error('Refusing to initialize a MongoDB process not started by this demo.');
      await admin.command({ replSetInitiate: { _id: 'postmanDemo', members: [{ _id: 0, host: '127.0.0.1:27019' }] } });
    }
    for (let i = 0; i < 60; i++) {
      if ((await admin.command({ hello: 1 })).isWritablePrimary) return;
      await sleep(500);
    }
    throw new Error('Demo replica set election timed out.');
  } finally { await client.close(); }
}

// เริ่มขั้นตอนหลัก: เปิด API และฐานข้อมูลแยกสำหรับทดลองใน Postman
async function main() {
  await mongoReady();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'],
      { cwd: root, env: { ...process.env, DATABASE_URL: url }, windowsHide: true, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('Demo schema setup failed.')));
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
  const user = await prisma.user.upsert({ where: { id: ids.user }, update: {}, create: {
    id: ids.user, name: 'Postman Demo Receptionist', email: 'postman@hotel-demo.local',
    passwordHash: await bcrypt.hash('PostmanDemo!2026', 12), role: 'receptionist', active: true,
  } });
  await prisma.roomType.upsert({ where: { id: ids.type }, update: {}, create: {
    id: ids.type, name: 'Postman Standard', nameKey: 'postman-standard', capacity: 2, basePrice: 1200,
    amenities: ['Wi-Fi', 'Air conditioning'], active: true, createdById: user.id, updatedById: user.id,
  } });
  await prisma.room.upsert({ where: { id: ids.room }, update: {}, create: {
    id: ids.room, number: 'POSTMAN-101', floor: 1, roomTypeId: ids.type, status: 'available', active: true,
    createdById: user.id, updatedById: user.id,
  } });
  await prisma.guest.upsert({ where: { id: ids.guest }, update: {}, create: {
    id: ids.guest, fullName: 'Postman Demo Guest', phone: '0812345678',
    documentNo: 'POSTMAN-DEMO-001', documentNoKey: 'POSTMAN-DEMO-001', active: true,
    createdById: user.id, updatedById: user.id,
  } });
  process.env.DATABASE_URL = url;
  const { createApp } = require('../app');
  server = createApp(prisma).listen(3000, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  console.log('POSTMAN DEMO READY: http://127.0.0.1:3000 | room 1200 THB/night | isolated hotel_lobby_postman_demo');
}

// ปิดเมนูหรือหน้าต่างที่เปิดอยู่
async function close() {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (prisma) await prisma.$disconnect();
  if (mongoProcess) mongoProcess.kill();
}
process.once('SIGINT', () => close().then(() => process.exit(0)));
process.once('SIGTERM', () => close().then(() => process.exit(0)));
main().catch(async error => { console.error(error.message); await close(); process.exit(1); });
