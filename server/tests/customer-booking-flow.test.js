const request = require('supertest');
const bcrypt = require('bcryptjs');
const { startDatabase } = require('./task3-db');
const { createApp } = require('../app');

let db, app, token, secondToken, room, type, actor;
beforeAll(async () => {
  db = await startDatabase('hotel_lobby_task5_test');
  app = createApp(db.prisma);
  type = await db.prisma.roomType.create({ data: { name: 'Standard', nameKey: 'standard-customer', capacity: 2, basePrice: 1200, amenities: ['Wi-Fi'] } });
  room = await db.prisma.room.create({ data: { number: '101', roomTypeId: type.id, status: 'available', active: true } });
  await db.prisma.room.create({ data: { number: '102', roomTypeId: type.id, status: 'maintenance', active: true } });
  actor = await db.prisma.user.create({ data: { name: 'Customer', email: 'customer@example.test', role: 'customer', passwordHash: await bcrypt.hash('customer-password-123', 4) } });
  await db.prisma.user.create({ data: { name: 'Other', email: 'other@example.test', role: 'customer', passwordHash: await bcrypt.hash('customer-password-123', 4) } });
  token = (await request(app).post('/api/auth/login').send({ email: 'customer@example.test', password: 'customer-password-123' })).body.token;
  secondToken = (await request(app).post('/api/auth/login').send({ email: 'other@example.test', password: 'customer-password-123' })).body.token;
}, 180000);
afterAll(async () => { if (db) await db.stop(); }, 30000);
const auth = value => ({ Authorization: `Bearer ${value}` });
const input = () => ({ roomId: room.id, checkInDate: '2026-11-10', checkOutDate: '2026-11-12', phone: '0812345678', documentNo: 'PASSPORT-ABC123', expectedPricePerNight: 1200 });

test('grid shows available and maintenance rooms without guest details', async () => {
  const response = await request(app).get('/api/public/rooms/grid').query({ checkInDate: '2026-11-10', checkOutDate: '2026-11-12', roomTypeId: type.id });
  expect(response.status).toBe(200);
  expect(response.body.items.map(item => item.status)).toEqual(['available', 'maintenance']);
  expect(JSON.stringify(response.body)).not.toContain('documentNo');
});

test('customer booking creates claims and pending payment, is idempotent and private', async () => {
  const key = 'customer-booking-key-001';
  const first = await request(app).post('/api/customer/bookings').set(auth(token)).set('Idempotency-Key', key).send(input());
  expect(first.status).toBe(201);
  expect(first.body).toMatchObject({ roomNumber: '101', guestCount: 2, totalPrice: 2400, status: 'confirmed', paymentStatus: 'pending' });
  const again = await request(app).post('/api/customer/bookings').set(auth(token)).set('Idempotency-Key', key).send(input());
  expect(again.status).toBe(200);
  expect(again.body.id).toBe(first.body.id);
  expect(await db.prisma.roomNightClaim.count({ where: { bookingId: first.body.id } })).toBe(2);
  expect(await db.prisma.payment.count({ where: { bookingId: first.body.id } })).toBe(1);
  expect((await request(app).get('/api/customer/bookings').set(auth(token))).body.items).toHaveLength(1);
  expect((await request(app).get('/api/customer/bookings').set(auth(secondToken))).body.items).toHaveLength(0);
  expect((await request(app).get('/api/customer/bookings')).status).toBe(401);
  expect((await request(app).post('/api/customer/bookings').set(auth(token)).set('Idempotency-Key', key).send({ ...input(), phone: '0899999999' })).status).toBe(409);
  expect((await request(app).post('/api/customer/bookings').set(auth(secondToken)).set('Idempotency-Key', 'customer-booking-key-002').send({ ...input(), documentNo: 'PASSPORT-OTHER' })).status).toBe(409);
});

test('rejects changed prices and unverified duplicate documents', async () => {
  const price = await request(app).post('/api/customer/bookings').set(auth(token)).set('Idempotency-Key', 'customer-booking-key-003').send({ ...input(), checkInDate: '2026-11-15', checkOutDate: '2026-11-16', expectedPricePerNight: 999 });
  expect(price.status).toBe(409);
  const duplicate = await request(app).post('/api/customer/bookings').set(auth(secondToken)).set('Idempotency-Key', 'customer-booking-key-004').send({ ...input(), checkInDate: '2026-11-15', checkOutDate: '2026-11-16' });
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.error.code).toBe('DOCUMENT_REVIEW_REQUIRED');
});

test('two customers racing for the same room and nights cannot both book', async () => {
  const range = { checkInDate: '2026-11-20', checkOutDate: '2026-11-22' };
  const [one, two] = await Promise.all([
    request(app).post('/api/customer/bookings').set(auth(token)).set('Idempotency-Key', 'customer-booking-race-1').send({ ...input(), ...range }),
    request(app).post('/api/customer/bookings').set(auth(secondToken)).set('Idempotency-Key', 'customer-booking-race-2').send({ ...input(), ...range, documentNo: 'PASSPORT-RACE-002' }),
  ]);
  expect([one.status, two.status].sort()).toEqual([201, 409]);
  expect(await db.prisma.booking.count({ where: { roomId: room.id, checkInDate: range.checkInDate } })).toBe(1);
});
