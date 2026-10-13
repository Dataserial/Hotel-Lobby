const request = require('supertest');
const bcrypt = require('bcryptjs');
const { startDatabase } = require('./task3-db');
const { createApp } = require('../app');
const { checkIn, checkOut } = require('../services/stay-service');
const { recordTestReceipt } = require('./payment-fixture');

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

test('simultaneous identical requests replay the same booking', async () => {
  const payload = { ...input(), checkInDate: '2027-01-10', checkOutDate: '2027-01-12' };
  const responses = await Promise.all(Array.from({ length: 3 }, () => request(app).post('/api/customer/bookings').set(auth(token)).set('Idempotency-Key', 'simultaneous-replay-key').send(payload)));
  expect(responses.every(response => [200, 201].includes(response.status))).toBe(true);
  expect(new Set(responses.map(response => response.body.id)).size).toBe(1);
  expect(await db.prisma.booking.count({ where: { checkInDate: payload.checkInDate } })).toBe(1);
});

test('legacy document without customer owner is never linked and rollback leaves no booking', async () => {
  const guest = await db.prisma.guest.create({ data: { fullName: 'Legacy Guest', phone: '0800000000', documentNo: 'LEGACY-12345', documentNoKey: 'LEGACY-12345' } });
  const response = await request(app).post('/api/customer/bookings').set(auth(token)).set('Idempotency-Key', 'legacy-document-key').send({ ...input(), checkInDate: '2027-01-15', checkOutDate: '2027-01-17', documentNo: 'legacy-12345' });
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('DOCUMENT_REVIEW_REQUIRED');
  expect(await db.prisma.guest.findUnique({ where: { id: guest.id } })).toMatchObject({ fullName: 'Legacy Guest', customerId: null });
  expect(await db.prisma.booking.count({ where: { checkInDate: '2027-01-15' } })).toBe(0);
});

test('grid uses all selected nights, hides inactive rooms, and types need no guest count', async () => {
  await db.prisma.room.create({ data: { number: '2', roomTypeId: type.id, active: true } });
  await db.prisma.room.create({ data: { number: '10', roomTypeId: type.id, active: true } });
  await db.prisma.room.create({ data: { number: '999', roomTypeId: type.id, active: false } });
  const params = { checkInDate: '2026-11-09', checkOutDate: '2026-11-11', roomTypeId: type.id };
  const response = await request(app).get('/api/public/rooms/grid').query(params);
  expect(response.body.items.map(row => row.roomNumber)).toEqual(['2', '10', '101', '102']);
  expect(response.body.items.find(row => row.roomNumber === '101').status).toBe('unavailable');
  expect(response.body.items.every(row => Object.keys(row).sort().join(',') === 'roomId,roomNumber,status')).toBe(true);
  const types = await request(app).get('/api/public/rooms/grid/types').query({ checkInDate: params.checkInDate, checkOutDate: params.checkOutDate });
  expect(types.status).toBe(200);
  expect(types.body.items.find(row => row.id === type.id)).toMatchObject({ availableRooms: 2, totalRooms: 4, capacity: 2, pricePerNight: 1200 });
  expect((await request(app).get('/api/public/rooms/grid/types').query({ ...params, guestCount: 20 })).status).toBe(400);
  expect((await request(app).get('/api/public/rooms/grid').query({ ...params, checkOutDate: params.checkInDate })).status).toBe(400);
});

test('invalid dates and maintenance bookings fail without guest or payment side effects', async () => {
  const maintenance = await db.prisma.room.findUnique({ where: { number: '102' } });
  for (const extra of [{ checkInDate: '2027-02-30' }, { checkOutDate: '2026-11-10' }, { roomId: maintenance.id }]) {
    const response = await request(app).post('/api/customer/bookings').set(auth(token)).set('Idempotency-Key', 'invalid-input-booking-key').send({ ...input(), documentNo: 'INVALID-DOCUMENT', ...extra });
    expect([400, 409]).toContain(response.status);
  }
  expect(await db.prisma.guest.count({ where: { documentNoKey: 'INVALID-DOCUMENT' } })).toBe(0);
});

test('customer cannot access staff guest or booking endpoints; staff sees web bookings', async () => {
  for (const endpoint of ['/api/guests', '/api/bookings', '/api/users']) expect((await request(app).get(endpoint).set(auth(token))).status).toBe(403);
  expect((await request(app).patch('/api/customer/bookings/000000000000000000000000').set(auth(token)).send({ status: 'cancelled' })).status).toBe(403);
  await db.prisma.user.create({ data: { name: 'Staff', email: 'customer-flow-staff@example.test', role: 'receptionist', passwordHash: await bcrypt.hash('staff-password-123', 4) } });
  const staffToken = (await request(app).post('/api/auth/login').send({ email: 'customer-flow-staff@example.test', password: 'staff-password-123' })).body.token;
  const response = await request(app).get('/api/bookings').set(auth(staffToken));
  expect(response.status).toBe(200);
  expect(response.body.items.some(row => row.roomId === room.id && row.checkInDate === '2026-11-10')).toBe(true);
  expect((await request(app).get('/api/customer/bookings').set(auth(staffToken))).status).toBe(403);
});

test('reprice needs a new confirmation and uses server capacity', async () => {
  await db.prisma.roomType.update({ where: { id: type.id }, data: { basePrice: 1300, capacity: 3 } });
  const payload = { ...input(), checkInDate: '2027-03-10', checkOutDate: '2027-03-12' };
  const first = await request(app).post('/api/customer/bookings').set(auth(token)).set('Idempotency-Key', 'reprice-booking-key').send(payload);
  expect(first.body.error.code).toBe('PRICE_CHANGED');
  expect(await db.prisma.booking.count({ where: { checkInDate: payload.checkInDate } })).toBe(0);
  const second = await request(app).post('/api/customer/bookings').set(auth(token)).set('Idempotency-Key', 'reprice-booking-key-new').send({ ...payload, expectedPricePerNight: 1300 });
  expect(second.status).toBe(201);
  expect(second.body).toMatchObject({ guestCount: 3, pricePerNight: 1300, totalPrice: 2600, paymentStatus: 'pending' });
});

test('room conflict rolls back newly created guest, booking, payment and request key', async () => {
  const before = await db.prisma.payment.count();
  const response = await request(app).post('/api/customer/bookings').set(auth(secondToken)).set('Idempotency-Key', 'rollback-claim-conflict-key').send({ ...input(), documentNo: 'ROLLBACK-NEW-GUEST', expectedPricePerNight: 1300 });
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('ROOM_UNAVAILABLE');
  expect(await db.prisma.guest.count({ where: { documentNoKey: 'ROLLBACK-NEW-GUEST' } })).toBe(0);
  expect(await db.prisma.payment.count()).toBe(before);
  const key = require('crypto').createHash('sha256').update(`${(await db.prisma.user.findUnique({ where: { email: 'other@example.test' } })).id}:rollback-claim-conflict-key`).digest('hex');
  expect(await db.prisma.customerBookingRequest.findUnique({ where: { key } })).toBeNull();
});

test('customer pagination is scoped to the owner and cannot filter another account', async () => {
  const response = await request(app).get('/api/customer/bookings').set(auth(token)).query({ page: 1, limit: 1 });
  expect(response.status).toBe(200);
  expect(response.body.items).toHaveLength(1);
  expect(response.body.total).toBe(await db.prisma.booking.count({ where: { customerId: actor.id } }));
  expect((await request(app).get('/api/customer/bookings').set(auth(secondToken)).query({ customerId: actor.id })).status).toBe(400);
});

test('occupied room may accept future bookings only after the existing departure', async () => {
  const original = process.env.ALLOW_FUTURE_OCCUPIED_BOOKINGS;
  process.env.ALLOW_FUTURE_OCCUPIED_BOOKINGS = 'true';
  try {
    const { hotelToday } = require('../services/stay-service');
    const start = hotelToday(new Date());
    const day = offset => new Date(Date.parse(start + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
    const occupied = await db.prisma.room.create({ data: { number: '500', roomTypeId: type.id, status: 'occupied', active: true } });
    const guest = await db.prisma.guest.findFirst({ where: { customerId: actor.id } });
    await db.prisma.booking.create({ data: { guestId: guest.id, roomId: occupied.id, guestCount: 2, checkInDate: start, checkOutDate: day(4), status: 'checked_in', pricePerNight: 1300, totalPrice: 5200, createdById: actor.id, updatedById: actor.id } });
    const before = await request(app).get('/api/public/rooms/grid').query({ checkInDate: day(1), checkOutDate: day(2), roomTypeId: type.id });
    const after = await request(app).get('/api/public/rooms/grid').query({ checkInDate: day(4), checkOutDate: day(5), roomTypeId: type.id });
    expect(before.body.items.find(row => row.roomId === occupied.id).status).toBe('unavailable');
    expect(after.body.items.find(row => row.roomId === occupied.id).status).toBe('available');
    expect((await request(app).get('/api/public/rooms/grid').query({ checkInDate: '2020-01-01', checkOutDate: '2020-01-02', roomTypeId: type.id })).status).toBe(400);
  } finally { if (original === undefined) delete process.env.ALLOW_FUTURE_OCCUPIED_BOOKINGS; else process.env.ALLOW_FUTURE_OCCUPIED_BOOKINGS = original; }
});

test('customers can book a checked-out room again, including legacy holds, with only one race winner', async () => {
  const currentType = await db.prisma.roomType.findUnique({ where: { id: type.id } });
  const payload = { ...input(), checkInDate: '2026-12-10', checkOutDate: '2026-12-12', expectedPricePerNight: currentType.basePrice };
  const prior = (await request(app).post('/api/customer/bookings').set(auth(token)).set('Idempotency-Key', 'checkout-prior-reservation').send(payload).expect(201)).body;
  const desk = await db.prisma.user.create({ data: { name: 'Checkout Desk', email: 'checkout-desk@example.test', role: 'receptionist', passwordHash: 'unused-test-hash' } });
  const clock = () => new Date('2026-12-10T01:00:00Z');
  await checkIn(db.prisma, prior.id, desk.id, clock);
  await recordTestReceipt(db.prisma, prior.id, desk.id, prior.totalPrice);
  await checkOut(db.prisma, prior.id, desk.id, clock);
  // Reproduce persisted holds left by the previous version of checkout.
  await db.prisma.roomNightClaim.createMany({ data: ['2026-12-10', '2026-12-11'].map(night => ({ roomId: room.id, bookingId: prior.id, night })) });
  const grid = (await request(app).get('/api/public/rooms/grid').query({ checkInDate: payload.checkInDate, checkOutDate: payload.checkOutDate, roomTypeId: type.id }).expect(200)).body;
  expect(grid.items.find(item => item.roomId === room.id).status).toBe('available');
  const results = await Promise.all([
    request(app).post('/api/customer/bookings').set(auth(token)).set('Idempotency-Key', 'checkout-rebook-customer-one').send(payload),
    request(app).post('/api/customer/bookings').set(auth(secondToken)).set('Idempotency-Key', 'checkout-rebook-customer-two').send({ ...payload, documentNo: 'PASSPORT-CHECKOUT-SECOND' }),
  ]);
  expect(results.map(result => result.status).sort()).toEqual([201, 409]);
  expect(await db.prisma.roomNightClaim.count({ where: { bookingId: prior.id } })).toBe(0);
  expect(await db.prisma.roomNightClaim.count({ where: { roomId: room.id, night: { in: ['2026-12-10', '2026-12-11'] } } })).toBe(2);
  expect(await db.prisma.booking.findUnique({ where: { id: prior.id } })).toMatchObject({ status: 'checked_out', actualCheckOutAt: clock(), totalPrice: prior.totalPrice });
});
