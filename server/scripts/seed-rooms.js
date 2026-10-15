// เพิ่มประเภทห้องและห้องพักตัวอย่าง
const defaults = [
  { name: 'Standard', nameKey: 'standard', capacity: 2, basePrice: 1200, amenities: ['Wi-Fi', 'Air conditioning'] },
  { name: 'Deluxe', nameKey: 'deluxe', capacity: 2, basePrice: 1800, amenities: ['Wi-Fi', 'Air conditioning', 'Breakfast'] },
  { name: 'Family', nameKey: 'family', capacity: 4, basePrice: 2600, amenities: ['Wi-Fi', 'Air conditioning', 'Breakfast'] },
];

async function seedRooms(prisma, { apply = false, log = console.log } = {}) {
  // อ่านประเภทห้องทั้งหมดรวมที่ปิดใช้ ก่อนกำหนดค่าเริ่มต้น
  const existingTypes = await prisma.roomType.findMany({ orderBy: { nameKey: 'asc' } });
  const rooms = await prisma.room.findMany({ select: { number: true, roomTypeId: true } });
  const types = existingTypes.length ? existingTypes.filter((type) => type.active) : defaults;
  if (!types.length) throw new Error('No active room types. Enable a room type before seeding.');
  if (types.length > 300) throw new Error('Too many room types for automatic floor assignment.');
  const numbers = new Set(rooms.map((room) => room.number));
  const plan = types.map((type, index) => ({
    type, floor: index + 1,
    numbers: Array.from({ length: 20 }, (_, offset) => String((index + 1) * 100 + offset + 1)),
  }));
  log(JSON.stringify({ mode: apply ? 'apply' : 'preview', existingRooms: rooms.length,
    existingTypes: existingTypes.map(({ name, active, capacity, basePrice }) => ({ name, active, capacity, basePrice })),
    plan: plan.map(({ type, floor, numbers: candidates }) => ({ type: type.name, floor,
      capacity: type.capacity, pricePerNight: type.basePrice,
      add: candidates.filter((number) => !numbers.has(number)),
      skipExisting: candidates.filter((number) => numbers.has(number)),
    })),
  }, null, 2));
  if (!apply) return { created: 0, preview: true };
  const admin = await prisma.user.findFirst({ where: { role: 'admin', active: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!admin) throw new Error('Create an active admin first with npm run db:admin:create');
  const audit = { createdById: admin.id, updatedById: admin.id };
  let created = 0;
  for (const entry of plan) {
    let type = entry.type;
    if (!type.id) {
      type = await prisma.roomType.upsert({ where: { nameKey: type.nameKey },
        create: { ...type, active: true, ...audit }, update: {},
      });
    }
    if (!type.active && type.active !== undefined) continue;
    for (const number of entry.numbers) {
      if (numbers.has(number)) continue;
      try {
        await prisma.room.create({ data: { number, floor: entry.floor, roomTypeId: type.id,
          status: 'available', active: true, ...audit } });
        created++;
      } catch (error) {
        // ดัชนีเลขห้องที่ห้ามซ้ำยังช่วยป้องกันการรันพร้อมกัน
        if (error.code !== 'P2002') throw error;
      }
    }
  }
  log(`Created ${created} rooms. Existing rooms and room types were preserved.`);
  return { created, preview: false };
}

// เริ่มขั้นตอนหลัก: เพิ่มประเภทห้องและห้องพักตัวอย่าง
async function main() {
  require('dotenv').config({ quiet: true });
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--apply')) throw new Error('Usage: npm run db:seed:rooms -- [--apply]');
  let url;
  try { url = new URL(process.env.DATABASE_URL); } catch { throw new Error('Set DATABASE_URL in server/.env or the environment'); }
  if (!['mongodb:', 'mongodb+srv:'].includes(url.protocol) || !/^\/[^/]+$/.test(url.pathname)) {
    throw new Error('DATABASE_URL must specify a MongoDB database name');
  }
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try { await seedRooms(prisma, { apply: args.includes('--apply') }); }
  finally { await prisma.$disconnect(); }
}

if (require.main === module) main().catch((error) => {
  console.error(error.name === 'Error' ? error.message : 'Room seed failed. Check database connectivity and indexes; rerun to complete missing rooms.');
  process.exitCode = 1;
});
module.exports = { seedRooms };
