const request = require('supertest');
const { createApp } = require('../app');
const { startDatabase } = require('./task3-db');
const { hotelToday } = require('../services/stay-service');
const { createBooking } = require('../services/booking-service');
let db;
beforeAll(async () => { db = await startDatabase('hotel_lobby_task5_test'); }, 180000);
afterAll(async () => { if (db) await db.stop(); }, 30000);

test('empty inventory returns honest zero counts and no invented room types', async () => {
  const response = await request(createApp(db.prisma)).get('/api/public/overview').expect(200);
  expect(response.body).toMatchObject({ totalRooms: 0, availableRooms: 0, bookedRooms: 0, roomTypes: [] });
});

test('public homepage reports real tonight inventory and prices without exposing booking or guest identities', async () => {
  const actor = await db.prisma.user.create({ data: { name: 'Private Admin', email: 'private@example.test', passwordHash: 'not-a-login-hash', role: 'admin' } });
  const guest = await db.prisma.guest.create({ data: { fullName: 'Private Guest', phone: '0812345678', documentNo: 'PRIVATE-DOC', documentNoKey: 'private-doc' } });
  const type = await db.prisma.roomType.create({ data: { name: 'Overview Suite', nameKey: 'overview suite', capacity: 2, basePrice: 1800, amenities: ['Wi-Fi'] } });
  const rooms = [];
  for (const [index, status] of ['available', 'available', 'maintenance'].entries()) rooms.push(await db.prisma.room.create({ data: { number: 'OV-' + index, floor: 1, roomTypeId: type.id, status, active: true } }));
  const date = hotelToday(new Date());
  const checkOutDate = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  await createBooking(db.prisma, { guestId: guest.id, roomId: rooms[0].id, guestCount: 2, checkInDate: date, checkOutDate }, actor.id);
  const app = createApp(db.prisma);
  const response = await request(app).get('/api/public/overview').expect(200);
  expect(response.body).toMatchObject({ date, checkOutDate, timezone: 'Asia/Bangkok', totalRooms: 3, availableRooms: 1, bookedRooms: 1 });
  expect(response.body.roomTypes).toEqual([{ id: type.id, name: 'Overview Suite', capacity: 2, pricePerNight: 1800, amenities: ['Wi-Fi'], totalRooms: 3, availableRooms: 1 }]);
  expect(JSON.stringify(response.body)).not.toMatch(/Private Guest|PRIVATE-DOC|private@example|passwordHash|guestId|roomId|payment/);
  expect(response.headers['cache-control']).toContain('no-store');
  await request(app).get('/api/public/overview?guestId=anything').expect(400);
  await db.prisma.room.update({ where: { id: rooms[1].id }, data: { status: 'maintenance' } });
  await db.prisma.roomType.update({ where: { id: type.id }, data: { basePrice: 2200 } });
  const refreshed = await request(app).get('/api/public/overview').expect(200);
  expect(refreshed.body.availableRooms).toBe(0);
  expect(refreshed.body.roomTypes[0].pricePerNight).toBe(2200);
});
