// ทดสอบการจองห้องเดิมในวันที่ไม่ทับซ้อนกัน
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { createApp } = require('../app');
const { hashToken } = require('../lib/auth');
const { hotelToday } = require('../services/stay-service');
const { startDatabase, expectConsistent, sample } = require('./task3-db');

let db, app, room, type, staffToken, customerToken, date;
const actorId = sample.users[1]._id;
const guestId = sample.guests[0]._id;
const authorization = token => ({ Authorization: `Bearer ${token}` });
const day = offset => new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const stay = (start, end) => ({ checkInDate: day(start), checkOutDate: day(end) });

beforeAll(async () => { db = await startDatabase('hotel_lobby_task5_test'); }, 180000);
beforeEach(async () => {
  await db.reset();
  app = createApp(db.prisma);
  date = hotelToday(new Date());
  type = await db.prisma.roomType.create({ data: { name: 'Scheduling Test', nameKey: 'scheduling-test', capacity: 2, basePrice: 1200, amenities: [] } });
  room = await db.prisma.room.create({ data: { number: 'SCHEDULE-101', roomTypeId: type.id, status: 'available', active: true } });
  staffToken = crypto.randomBytes(32).toString('base64url');
  await db.prisma.session.create({ data: { tokenHash: hashToken(staffToken), userId: actorId, expiresAt: new Date(Date.now() + 3600000) } });
  await db.prisma.user.create({ data: { name: 'Scheduling Customer', email: 'scheduling@example.test', role: 'customer', active: true, passwordHash: await bcrypt.hash('scheduling-password-123', 4) } });
  customerToken = (await request(app).post('/api/auth/login').send({ email: 'scheduling@example.test', password: 'scheduling-password-123' }).expect(200)).body.token;
});
afterEach(async () => { await expectConsistent(db.prisma); });
afterAll(async () => { if (db) await db.stop(); }, 30000);

function book(channel, range) {
  if (channel === 'staff') return request(app).post('/api/bookings').set(authorization(staffToken))
    .send({ ...range, guestId, roomId: room.id, guestCount: 2 });
  return request(app).post('/api/customer/bookings').set(authorization(customerToken)).set('Idempotency-Key', crypto.randomUUID())
    .send({ ...range, roomId: room.id, phone: '0812345678', documentNo: 'SCHEDULING-PASSPORT', expectedPricePerNight: 1200 });
}

async function assertAvailability(range, available) {
  const search = { ...range, guestCount: 2, roomTypeId: type.id };
  const [staff, publicList, grid, types, summary] = await Promise.all([
    request(app).get('/api/rooms/availability').set(authorization(staffToken)).query(search).expect(200),
    request(app).get('/api/public/rooms/availability').query(search).expect(200),
    request(app).get('/api/public/rooms/grid').query({ ...range, roomTypeId: type.id }).expect(200),
    request(app).get('/api/public/rooms/grid/types').query(range).expect(200),
    request(app).get('/api/public/rooms/summary').query({ ...range, guestCount: 2 }).expect(200),
  ]);
  expect(staff.body.items.some(item => item.roomId === room.id)).toBe(available);
  expect(publicList.body.items.some(item => item.roomId === room.id)).toBe(available);
  expect(grid.body.items.find(item => item.roomId === room.id).status).toBe(available ? 'available' : 'unavailable');
  expect(types.body.items.find(item => item.id === type.id).availableRooms).toBe(available ? 1 : 0);
  expect(summary.body.roomTypes.find(item => item.id === type.id).availableRooms).toBe(available ? 1 : 0);
}

test.each([
  ['staff', 'future-first'], ['staff', 'today-first'],
  ['customer', 'future-first'], ['customer', 'today-first'],
])('%s can book today and two days ahead in either order: %s', async (channel, order) => {
  const current = stay(0, 1), future = stay(2, 3);
  const [first, second] = order === 'future-first' ? [future, current] : [current, future];
  const a = (await book(channel, first).expect(201)).body;
  await assertAvailability(first, false);
  await assertAvailability(second, true);
  const b = (await book(channel, second).expect(201)).body;
  expect(a.id).not.toBe(b.id);
  expect(a.totalPrice).toBe(1200); expect(b.totalPrice).toBe(1200);
  expect(await db.prisma.booking.count({ where: { roomId: room.id, status: 'confirmed' } })).toBe(2);
  expect((await db.prisma.room.findUnique({ where: { id: room.id } })).status).toBe('available');
  await assertAvailability(current, false); await assertAvailability(future, false);
  await assertAvailability(stay(1, 2), true);
});

test.each(['staff', 'customer'])('%s allows checkout and the next check-in on the same date', async channel => {
  await book(channel, stay(2, 3)).expect(201);
  await assertAvailability(stay(0, 2), true);
  await book(channel, stay(0, 2)).expect(201);
  expect(await db.prisma.roomNightClaim.count({ where: { roomId: room.id } })).toBe(3);
});

test.each(['staff', 'customer'])('%s rejects a stay overlapping the future booking and rolls back writes', async channel => {
  await book(channel, stay(2, 3)).expect(201);
  await assertAvailability(stay(0, 3), false);
  const rejected = await book(channel, stay(0, 3)).expect(409);
  expect(rejected.body.error.code).toBe('ROOM_UNAVAILABLE');
  expect(await db.prisma.booking.count({ where: { roomId: room.id } })).toBe(1);
  expect(await db.prisma.roomNightClaim.count({ where: { roomId: room.id } })).toBe(1);
  await assertAvailability(stay(0, 2), true);
});

test.each(['staff', 'customer'])('%s can book two days ahead while a non-overlapping guest is currently checked in', async channel => {
  const originalFlag = process.env.ALLOW_FUTURE_OCCUPIED_BOOKINGS;
  process.env.ALLOW_FUTURE_OCCUPIED_BOOKINGS = 'true';
  try {
    const current = (await book('staff', stay(0, 1)).expect(201)).body;
    await request(app).post(`/api/bookings/${current.id}/check-in`).set(authorization(staffToken)).send({}).expect(200);
    expect((await db.prisma.room.findUnique({ where: { id: room.id } })).status).toBe('occupied');
    await assertAvailability(stay(2, 3), true);
    await book(channel, stay(2, 3)).expect(201);
    await assertAvailability(stay(0, 1), false);
    // การจองล่วงหน้าไม่เปลี่ยนสถานะการพักจริงของห้องปัจจุบัน
    expect((await db.prisma.room.findUnique({ where: { id: room.id } })).status).toBe('occupied');
  } finally {
    if (originalFlag === undefined) delete process.env.ALLOW_FUTURE_OCCUPIED_BOOKINGS;
    else process.env.ALLOW_FUTURE_OCCUPIED_BOOKINGS = originalFlag;
  }
});

test('staff and customer can concurrently reserve different nights of the same room', async () => {
  const results = await Promise.all([book('staff', stay(0, 1)), book('customer', stay(2, 3))]);
  expect(results.map(result => result.status)).toEqual([201, 201]);
  expect(await db.prisma.booking.count({ where: { roomId: room.id } })).toBe(2);
  expect(await db.prisma.roomNightClaim.count({ where: { roomId: room.id } })).toBe(2);
});

test('checkout frees the current stay while preserving a separate reservation two days ahead', async () => {
  const future = (await book('customer', stay(2, 3)).expect(201)).body;
  const current = (await book('staff', stay(0, 1)).expect(201)).body;
  await request(app).post(`/api/bookings/${current.id}/check-in`).set(authorization(staffToken)).send({}).expect(200);
  await request(app).post(`/api/bookings/${current.id}/payment/receipts`).set(authorization(staffToken)).set('Idempotency-Key', crypto.randomUUID())
    .send({ amount: 1200, method: 'cash', reference: `SCHEDULE-${current.id}`, occurredAt: new Date().toISOString() }).expect(201);
  await request(app).post(`/api/bookings/${current.id}/check-out`).set(authorization(staffToken)).send({}).expect(200);
  await assertAvailability(stay(0, 1), true);
  await assertAvailability(stay(2, 3), false);
  expect(await db.prisma.roomNightClaim.count({ where: { bookingId: current.id } })).toBe(0);
  expect(await db.prisma.roomNightClaim.count({ where: { bookingId: future.id } })).toBe(1);
  expect((await db.prisma.booking.findUnique({ where: { id: future.id } })).status).toBe('confirmed');
});
