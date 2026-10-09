require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const roomTypes = [
  { name: 'Demo Standard', nameKey: 'demo-standard', capacity: 2, basePrice: 1200, amenities: ['Wi-Fi', 'Air conditioning'], rooms: ['DEMO-101', 'DEMO-102', 'DEMO-103'] },
  { name: 'Demo Deluxe', nameKey: 'demo-deluxe', capacity: 2, basePrice: 1800, amenities: ['Wi-Fi', 'Air conditioning', 'Breakfast'], rooms: ['DEMO-201', 'DEMO-202', 'DEMO-203'] },
  { name: 'Demo Family', nameKey: 'demo-family', capacity: 4, basePrice: 2600, amenities: ['Wi-Fi', 'Air conditioning', 'Breakfast'], rooms: ['DEMO-301', 'DEMO-302', 'DEMO-303'] },
];

function demoConfig(env) {
  const url = new URL(env.DATABASE_URL || '');
  const database = url.pathname.slice(1);
  if (url.protocol !== 'mongodb:' || url.hostname !== '127.0.0.1' ||
      !/^hotel_lobby_[a-z0-9_]*(demo|test)$/.test(database)) {
    throw new Error('Demo seed only accepts a local hotel_lobby_*_demo or *_test database');
  }
  const email = (env.DEMO_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = env.DEMO_ADMIN_PASSWORD || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
    throw new Error('Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD (at least 12 characters)');
  }
  return { database, email, password };
}

async function seedDemo(prisma, { email, password }) {
  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Demo Admin', passwordHash: await bcrypt.hash(password, 12), role: 'admin', active: true },
    update: {},
  });
  for (const { rooms, ...typeData } of roomTypes) {
    const type = await prisma.roomType.upsert({
      where: { nameKey: typeData.nameKey },
      create: { ...typeData, createdById: admin.id, updatedById: admin.id },
      update: {},
    });
    for (const number of rooms) {
      await prisma.room.upsert({
        where: { number },
        create: {
          number, floor: Number(number.slice(5, 6)), roomTypeId: type.id,
          status: 'available', active: true, createdById: admin.id, updatedById: admin.id,
        },
        update: {},
      });
    }
  }
  return { admin, typeCount: roomTypes.length, roomCount: roomTypes.reduce((count, type) => count + type.rooms.length, 0) };
}

async function main() {
  const config = demoConfig(process.env);
  const prisma = new PrismaClient();
  try {
    const result = await seedDemo(prisma, config);
    console.log(`Demo seed checked in ${config.database}: 1 admin, ${result.typeCount} room types, ${result.roomCount} rooms`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { roomTypes, demoConfig, seedDemo };
