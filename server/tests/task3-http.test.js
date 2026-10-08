const crypto = require('crypto');
const request = require('supertest');
const { createApp } = require('../app');
const { hashToken } = require('../lib/auth');
const { createBooking } = require('../services/booking-service');
const { startDatabase, expectConsistent, sample } = require('./task3-db');

let db, app, tokens;
const actorId = sample.users[1]._id;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const input = (extra = {}) => ({
  guestId: sample.guests[0]._id, roomId: sample.rooms[0]._id, guestCount: 2,
  checkInDate: '2026-11-10', checkOutDate: '2026-11-12', ...extra,
});
const search = { checkInDate: '2026-10-12', checkOutDate: '2026-10-13', guestCount: 2 };
async function session(userId, expiresAt = new Date(Date.now() + 3600000)) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return token;
}
const post = (data = input()) => request(app).post('/api/bookings').set(auth(tokens.receptionist)).send(data);

beforeAll(async () => { db = await startDatabase(); app = createApp(db.prisma); }, 180000);
beforeEach(async () => {
  await db.reset();
  tokens = { admin: await session(sample.users[0]._id), receptionist: await session(actorId) };
});
afterEach(async () => expectConsistent(db.prisma));
afterAll(async () => { if (db) await db.stop(); }, 30000);

test('all booking and availability endpoints require a live authenticated identity', async () => {
  for (const [method, path] of [
    ['get', '/api/bookings'], ['get', `/api/bookings/${sample.bookings[1]._id}`],
    ['get', '/api/rooms/availability'], ['post', '/api/bookings'],
    ['patch', `/api/bookings/${sample.bookings[1]._id}`], ['post', `/api/bookings/${sample.bookings[1]._id}/cancel`],
  ]) expect((await request(app)[method](path).send(input())).status).toBe(401);
  const expired = await session(actorId, new Date(Date.now() - 1000));
  expect((await request(app).get('/api/bookings').set(auth(expired))).status).toBe(401);
  await request(app).post('/api/auth/logout').set(auth(tokens.receptionist)).expect(204);
  expect((await request(app).get('/api/bookings').set(auth(tokens.receptionist))).status).toBe(401);
  await db.prisma.user.update({ where: { id: sample.users[0]._id }, data: { active: false } });
  expect((await request(app).get('/api/rooms/availability').set(auth(tokens.admin)).query(search)).status).toBe(401);
});

test.each(['admin', 'receptionist'])('%s can create, list, read, update and cancel; audit comes from session', async (role) => {
  const headers = auth(tokens[role]);
  const actor = role === 'admin' ? sample.users[0]._id : actorId;
  const created = await request(app).post('/api/bookings').set(headers).set('actorId', sample.users[0]._id)
    .set('X-Actor-Id', sample.users[0]._id).send(input()).expect(201);
  expect(created.body).toMatchObject({ createdById: actor, updatedById: actor, pricePerNight: 1200, totalPrice: 2400 });
  expect(created.headers['x-request-id']).toBeDefined();
  expect((await request(app).get(`/api/bookings/${created.body.id}`).set(headers).expect(200)).body).toEqual(created.body);
  const listed = await request(app).get('/api/bookings').set(headers)
    .query({ status: 'confirmed', guestId: input().guestId, roomId: input().roomId,
      checkInFrom: input().checkInDate, checkInTo: input().checkInDate, limit: 1, page: 1 }).expect(200);
  expect(listed.body).toMatchObject({ total: 1, page: 1, limit: 1, items: [created.body] });
  await request(app).patch(`/api/bookings/${created.body.id}`).set(headers).send({ guestCount: 1 }).expect(200);
  const cancelled = await request(app).post(`/api/bookings/${created.body.id}/cancel`).set(headers).send({}).expect(200);
  expect(cancelled.body).toMatchObject({ status: 'cancelled', updatedById: actor });
  expect(cancelled.body.cancelledAt).toBeDefined();
  expect((await post()).status).toBe(201);
  expect((await request(app).post(`/api/bookings/${created.body.id}/cancel`).set(headers)).body.error.code).toBe('INVALID_TRANSITION');
  expect((await request(app).patch(`/api/bookings/${created.body.id}`).set(headers).send({ guestCount: 2 })).body.error.code)
    .toBe('INVALID_TRANSITION');
});

test('availability is filtered before pagination, uses service output, and reveals no PII', async () => {
  const first = await request(app).get('/api/rooms/availability').set(auth(tokens.admin)).query({ ...search, limit: 1 }).expect(200);
  const second = await request(app).get('/api/rooms/availability').set(auth(tokens.receptionist)).query({ ...search, limit: 1, page: 2 }).expect(200);
  expect(first.body).toMatchObject({ total: 2, items: [{ roomNumber: '101', capacity: 2, pricePerNight: 1200 }] });
  expect(second.body).toMatchObject({ total: 2, items: [{ roomNumber: '305' }] });
  expect(Object.keys(first.body.items[0]).sort()).toEqual(['capacity', 'pricePerNight', 'roomId', 'roomNumber', 'roomType']);
  expect((await request(app).get('/api/rooms/availability').set(auth(tokens.admin)).query({ ...search, guestCount: 4 })).body.items).toEqual([]);
  await db.prisma.room.update({ where: { number: '101' }, data: { active: false } });
  await db.prisma.roomType.update({ where: { nameKey: 'deluxe' }, data: { active: false } });
  expect((await request(app).get('/api/rooms/availability').set(auth(tokens.admin)).query(search)).body.total).toBe(0);
});

test('client cannot set actor, prices, status or audit, even through query strings', async () => {
  for (const field of ['actorId', 'createdById', 'updatedById', 'status', 'totalPrice', 'pricePerNight', 'cancelledAt']) {
    await post({ ...input(), [field]: sample.users[0]._id }).expect(400);
  }
  await request(app).post('/api/bookings').set(auth(tokens.receptionist)).query({ actorId: sample.users[0]._id }).send(input()).expect(400);
  const created = await post().expect(201);
  await request(app).patch(`/api/bookings/${created.body.id}`).set(auth(tokens.admin)).send({ actorId }).expect(400);
  await request(app).post(`/api/bookings/${created.body.id}/cancel`).set(auth(tokens.admin)).send({ actorId }).expect(400);
  await request(app).post(`/api/bookings/${created.body.id}/cancel`).set(auth(tokens.admin)).query({ actorId }).expect(400);
  expect(await db.prisma.booking.count()).toBe(sample.bookings.length + 1);
});

test.each([
  [{ checkInDate: '2026-02-29' }, 'INVALID_DATE_RANGE', 400],
  [{ checkOutDate: '2026-11-10' }, 'INVALID_DATE_RANGE', 400],
  [{ checkOutDate: '2027-11-12' }, 'INVALID_DATE_RANGE', 400],
  [{ guestCount: 1.5 }, 'INVALID_GUEST_COUNT', 400],
  [{ guestCount: 3 }, 'CAPACITY_EXCEEDED', 400],
  [{ guestId: '400000000000000000000099' }, 'GUEST_NOT_FOUND', 404],
  [{ roomId: '300000000000000000000099' }, 'ROOM_NOT_FOUND', 404],
  [{ roomId: sample.rooms[1]._id }, 'ROOM_UNAVAILABLE', 409],
  [{ roomId: sample.rooms[3]._id }, 'ROOM_UNAVAILABLE', 409],
])('invalid create %j returns %s with request ID and no side effects', async (extra, code, status) => {
  const response = await post(input(extra)).expect(status);
  expect(response.body.error).toMatchObject({ code, requestId: response.headers['x-request-id'] });
  expect(await db.prisma.booking.count()).toBe(sample.bookings.length);
});

test('list/detail errors, unknown fields and invalid query values keep the HTTP contract', async () => {
  for (const query of [
    { actorId }, { status: 'unknown' }, { roomId: 'bad' }, { checkInFrom: '2026-02-29' },
    { checkInFrom: '2026-11-12', checkInTo: '2026-11-10' }, { limit: 101 }, { page: 0 },
  ]) await request(app).get('/api/bookings').set(auth(tokens.admin)).query(query).expect(400);
  for (const query of [{ ...search, actorId }, { ...search, guestCount: '2x' }, { ...search, guestCount: ['1', '2'] },
    { ...search, guestCount: 0 }, { ...search, checkInDate: 'bad' }]) {
    await request(app).get('/api/rooms/availability').set(auth(tokens.admin)).query(query).expect(400);
  }
  await request(app).get('/api/bookings/bad').set(auth(tokens.admin)).expect(400);
  expect((await request(app).get('/api/bookings/500000000000000000000099').set(auth(tokens.admin)).expect(404)).body.error.code).toBe('BOOKING_NOT_FOUND');
  for (const method of ['patch', 'post']) {
    const suffix = method === 'post' ? '/cancel' : '';
    const payload = method === 'post' ? {} : { guestCount: 1 };
    expect((await request(app)[method](`/api/bookings/500000000000000000000099${suffix}`)
      .set(auth(tokens.admin)).send(payload).expect(404)).body.error.code).toBe('BOOKING_NOT_FOUND');
    await request(app)[method](`/api/bookings/bad${suffix}`).set(auth(tokens.admin)).send(payload).expect(400);
    expect((await request(app)[method](`/api/bookings/${sample.bookings[0]._id}${suffix}`)
      .set(auth(tokens.admin)).send(payload).expect(409)).body.error.code).toBe('INVALID_TRANSITION');
  }
  await request(app).get(`/api/bookings/${sample.bookings[1]._id}`).set(auth(tokens.admin)).query({ actorId }).expect(400);
  await request(app).patch(`/api/bookings/${sample.bookings[1]._id}`).set(auth(tokens.admin)).send({}).expect(400);
  await request(app).patch(`/api/bookings/${sample.bookings[1]._id}`).set(auth(tokens.admin)).send({ roomId: null }).expect(400);
  const listed = await request(app).get('/api/bookings').set(auth(tokens.admin)).expect(200);
  for (const row of listed.body.items) {
    expect(row.guest).toBeUndefined(); expect(row.payment).toBeUndefined(); expect(row.createdBy).toBeUndefined();
  }
});

test.each([
  ['2026-11-09', '2026-11-11'], ['2026-11-11', '2026-11-13'],
  ['2026-11-10', '2026-11-12'], ['2026-11-09', '2026-11-13'], ['2026-11-10', '2026-11-11'],
])('overlap %s–%s returns 409 and rolls back', async (checkInDate, checkOutDate) => {
  await post().expect(201);
  const response = await post(input({ checkInDate, checkOutDate })).expect(409);
  expect(response.body.error.code).toBe('ROOM_UNAVAILABLE');
  expect(await db.prisma.booking.count()).toBe(sample.bookings.length + 1);
});

test('adjacent stays, leap day and 365 nights succeed', async () => {
  await post().expect(201);
  await post(input({ checkInDate: '2026-11-12', checkOutDate: '2026-11-13' })).expect(201);
  const leap = await post(input({ checkInDate: '2028-02-28', checkOutDate: '2028-03-01' })).expect(201);
  expect(leap.body.totalPrice).toBe(2400);
  await post(input({ checkInDate: '2029-01-01', checkOutDate: '2030-01-01' })).expect(201);
});

test('HTTP exposes payment guards and preserves rollback on conflicting edits', async () => {
  const b = await createBooking(db.prisma, input(), actorId);
  await createBooking(db.prisma, input({ roomId: sample.rooms[2]._id }), actorId);
  const edit = () => request(app).patch(`/api/bookings/${b.id}`).set(auth(tokens.admin));
  expect((await edit().send({ roomId: sample.rooms[2]._id }).expect(409)).body.error.code).toBe('ROOM_UNAVAILABLE');
  await db.prisma.payment.update({ where: { bookingId: b.id }, data: { paidAmount: 100 } });
  expect((await edit().send({ checkOutDate: '2026-11-13' }).expect(409)).body.error.code).toBe('PAYMENT_ADJUSTMENT_REQUIRED');
  expect((await request(app).post(`/api/bookings/${b.id}/cancel`).set(auth(tokens.admin)).expect(409)).body.error.code).toBe('PAYMENT_REFUND_REQUIRED');
  expect(await db.prisma.booking.findUnique({ where: { id: b.id } })).toMatchObject({ totalPrice: 2400, roomId: input().roomId });
});
