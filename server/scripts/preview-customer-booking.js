// Disposable local replica set for manual browser QA. Never uses DATABASE_URL.
const { startDatabase } = require('../tests/task3-db');
const { createApp } = require('../app');
async function main() {
  const db = await startDatabase('hotel_lobby_task5_test');
  for (const [index, name, capacity, basePrice] of [[1, 'Standard', 2, 1200], [2, 'Deluxe', 2, 1800], [3, 'Family', 4, 2600]]) {
    const type = await db.prisma.roomType.create({ data: { name, nameKey: name.toLowerCase(), capacity, basePrice, amenities: ['Wi-Fi'] } });
    for (let number = 1; number <= 8; number++) await db.prisma.room.create({ data: { number: String(index * 100 + number), roomTypeId: type.id, status: number === 2 ? 'maintenance' : 'available', active: number !== 8 } });
  }
  process.env.CORS_ORIGINS = 'http://127.0.0.1:5174';
  process.env.PUBLIC_CORS_ORIGINS = process.env.CORS_ORIGINS;
  const server = createApp(db.prisma).listen(3031, '127.0.0.1', () => console.log('Disposable booking QA API: http://127.0.0.1:3031'));
  const close = () => server.close(async () => { await db.stop(); process.exit(0); });
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
main().catch(() => { console.error('Unable to start disposable booking QA API'); process.exitCode = 1; });
