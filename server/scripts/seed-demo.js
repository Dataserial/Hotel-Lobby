require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  const db = url.pathname.slice(1);
  if (!/^hotel_lobby_[a-z0-9_]*(demo|test)$/.test(db) || url.hostname !== '127.0.0.1') {
    throw new Error('Demo seed only accepts a local hotel_lobby_*_demo or *_test database');
  }
  const email = (process.env.DEMO_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.DEMO_ADMIN_PASSWORD || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
    throw new Error('Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD (at least 12 characters)');
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name: 'Demo Admin', passwordHash: await bcrypt.hash(password, 12), role: 'admin', active: true },
      update: {},
    });
    const type = await prisma.roomType.upsert({
      where: { nameKey: 'demo-standard' },
      create: { name: 'Demo Standard', nameKey: 'demo-standard', capacity: 2, basePrice: 1200, amenities: ['Wi-Fi'], createdById: user.id, updatedById: user.id },
      update: {},
    });
    await prisma.room.upsert({
      where: { number: 'DEMO-101' },
      create: { number: 'DEMO-101', floor: 1, roomTypeId: type.id, status: 'available', active: true, createdById: user.id, updatedById: user.id },
      update: {},
    });
    console.log(`Demo seed checked in ${db}: admin, room type, room`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
