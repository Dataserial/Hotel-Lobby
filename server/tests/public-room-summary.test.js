// ทดสอบผลสรุปห้องว่างหลายวัน
const request = require('supertest');
const { createApp } = require('../app');
const { startDatabase } = require('./task3-db');
const { createBooking } = require('../services/booking-service');
const { findAvailableRooms } = require('../services/availability-service');
let db;
beforeAll(async () => { db = await startDatabase('hotel_lobby_task5_test'); }, 180000);
afterAll(async () => { if (db) await db.stop(); }, 30000);

test('empty and end-of-calendar searches never invent rooms or invalid alternative dates', async () => {
  const app = createApp(db.prisma);
  const response = await request(app).get('/api/public/rooms/summary').query({ checkInDate: '9999-12-30', checkOutDate: '9999-12-31', guestCount: 1 }).expect(200);
  expect(response.body).toMatchObject({ totalAvailableRooms: 0, roomTypes: [], previewDays: 1 });
  await request(app).get('/api/public/rooms/summary').query({ checkInDate: '2026-11-01', checkOutDate: '2026-11-02', guestCount: 0 }).expect(400);
});

test('public room summary counts types across the whole stay and offers real alternative start dates', async () => {
  const actor = await db.prisma.user.create({ data: { name: 'Private Actor', email: 'summary@example.test', passwordHash: 'unused', role: 'admin' } });
  const guest = await db.prisma.guest.create({ data: { fullName: 'Private Guest', phone: '0812345678', documentNo: 'PRIVATE-SUMMARY', documentNoKey: 'private-summary' } });
  const type = await db.prisma.roomType.create({ data: { name: 'Standard', nameKey: 'standard', capacity: 2, basePrice: 1200, amenities: ['Wi-Fi'] } });
  const family = await db.prisma.roomType.create({ data: { name: 'Family', nameKey: 'family', capacity: 4, basePrice: 2600, amenities: [] } });
  const rooms = [];
  for (const [index, status] of ['available', 'available', 'maintenance'].entries()) rooms.push(await db.prisma.room.create({ data: { number: 'SUM-' + index, floor: 1, roomTypeId: type.id, status, active: true } }));
  await db.prisma.room.create({ data: { number: 'FAMILY', roomTypeId: family.id, status: 'available', active: true } });
  for (const [roomId, checkInDate, checkOutDate] of [[rooms[0].id, '2026-11-10', '2026-11-12'], [rooms[1].id, '2026-11-12', '2026-11-13']]) await createBooking(db.prisma, { guestId: guest.id, roomId, checkInDate, checkOutDate, guestCount: 2 }, actor.id);
  const app = createApp(db.prisma);const stay = { checkInDate: '2026-11-10', checkOutDate: '2026-11-12', guestCount: 2 };
  const response = await request(app).get('/api/public/rooms/summary').query(stay).expect(200);
  expect(response.body).toMatchObject({ ...stay, nights: 2, totalAvailableRooms: 2, previewDays: 14 });
  const standard = response.body.roomTypes.find(t => t.id === type.id);
  expect(standard).toMatchObject({ name: 'Standard', capacity: 2, pricePerNight: 1200, totalRooms: 3, availableRooms: 1 });
  expect(standard.dates).toHaveLength(14);
  expect(standard.dates[1]).toEqual({ checkInDate: '2026-11-11', checkOutDate: '2026-11-13', availableRooms: 0 });
  expect(standard.dates[2]).toEqual({ checkInDate: '2026-11-12', checkOutDate: '2026-11-14', availableRooms: 1 });
  for (const date of standard.dates) {
    const available = await findAvailableRooms(db.prisma, { ...date, guestCount: 2 });
    expect(date.availableRooms).toBe(available.filter(room => room.roomType === 'Standard').length);
  }
  expect(JSON.stringify(response.body)).not.toMatch(/Private Guest|PRIVATE-SUMMARY|guestId|roomNumber|passwordHash|payment/);
  expect(response.headers['cache-control']).toContain('no-store');
  const larger = await request(app).get('/api/public/rooms/summary').query({ ...stay, guestCount: 3 }).expect(200);
  expect(larger.body.roomTypes.find(t => t.id === type.id).availableRooms).toBe(0);
  expect(larger.body.totalAvailableRooms).toBe(1);
  await request(app).get('/api/public/rooms/summary').query({ ...stay, excludeBookingId: rooms[0].id }).expect(400);
  await request(app).get('/api/public/rooms/summary').query({ ...stay, checkOutDate: '2026-02-30' }).expect(400);
  const occupiedBooking = await db.prisma.booking.findFirst({ where: { roomId: rooms[0].id } });
  await db.prisma.booking.update({ where: { id: occupiedBooking.id }, data: { status: 'checked_in' } });
  await db.prisma.room.update({ where: { id: rooms[0].id }, data: { status: 'occupied' } });
  const { publicRoomSummary } = require('../services/public-room-summary');
  for (const now of [new Date('2026-11-10T05:00:00Z'), new Date('2026-11-15T05:00:00Z')]) {
    const futureStay = { checkInDate: '2026-11-13', checkOutDate: '2026-11-15', guestCount: 2 };
    const summary = await publicRoomSummary(db.prisma, futureStay, now);
    const found = await findAvailableRooms(db.prisma, { ...futureStay, now });
    expect(summary.roomTypes.find(t => t.id === type.id).availableRooms).toBe(found.filter(room => room.roomType === 'Standard').length);
  }
});
