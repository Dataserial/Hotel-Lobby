const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const { startDatabase, assertTestUrl } = require('./task3-db');
const { dashboard } = require('../services/dashboard-service');
const { rateLimit } = require('../lib/security');
const { hotelToday } = require('../services/stay-service');
let db, app, token;
const auth = () => ({ Authorization: `Bearer ${token}` });
beforeAll(async () => { db = await startDatabase('hotel_lobby_task5_test'); }, 180000);
beforeEach(async () => {
  await db.reset(); app = createApp(db.prisma);
  const user = await db.prisma.user.create({ data: { name: 'Task 5', email: 'task5@example.test',
    passwordHash: await bcrypt.hash('task5-password-123', 10), role: 'admin' } });
  token = (await request(app).post('/api/auth/login').send({ email: user.email, password: 'task5-password-123' }).expect(200)).body.token;
});
afterAll(async () => { if (db) await db.stop(); }, 30000);

test('full HTTP flow from login to booking, payment, stay, dashboard, public and logout', async () => {
  const post = (url, data) => request(app).post(url).set(auth()).send(data);
  const type = (await post('/api/room-types', { name: 'Task5 Suite', capacity: 2, basePrice: 1500 }).expect(201)).body;
  const room = (await post('/api/rooms', { roomNumber: 'TASK5-101', floor: 1, roomTypeId: type.id }).expect(201)).body;
  const guest = (await post('/api/guests', { fullName: 'Demo Guest', phone: '0812345678', documentNo: 'TASK5-DEMO' }).expect(201)).body;
  const date = hotelToday(new Date());
  const end = new Date(`${date}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
  const stay = { checkInDate: date, checkOutDate: end.toISOString().slice(0, 10), guestCount: 2 };
  const internal = await request(app).get('/api/rooms/availability').set(auth()).query(stay).expect(200);
  const external = await request(app).get('/api/public/rooms/availability').query(stay).expect(200);
  expect(external.body).toEqual(internal.body);
  const booking = (await post('/api/bookings', { ...stay, guestId: guest.id, roomId: room.id }).expect(201)).body;
  expect((await request(app).get('/api/public/rooms/availability').query(stay)).body.items.map(r => r.roomId)).not.toContain(room.id);
  await request(app).post(`/api/bookings/${booking.id}/payment/receipts`).set(auth()).set('Idempotency-Key', 'task5-receipt')
    .send({ amount: 1500, method: 'cash', reference: 'TASK5-VOUCHER', occurredAt: new Date().toISOString() }).expect(201);
  await post(`/api/bookings/${booking.id}/check-in`, {}).expect(200);
  await post(`/api/bookings/${booking.id}/check-out`, {}).expect(200);
  expect((await request(app).get('/api/dashboard').set(auth()).expect(200)).body).toMatchObject({ date, timezone: 'Asia/Bangkok' });
  expect((await request(app).get('/api/dashboard/report').set(auth()).expect(200)).body.receivedBaht).toBeGreaterThanOrEqual(1500);
  await post('/api/auth/logout', {}).expect(204);
  await request(app).get('/api/dashboard').set(auth()).expect(401);
});

test('dashboard uses Bangkok boundary and availability service with exact fixture counts', async () => {
  const result = await dashboard(db.prisma, new Date('2026-10-08T17:00:00Z'));
  expect(result.date).toBe('2026-10-09');
  const rooms = await require('../services/availability-service').findAvailableRooms(db.prisma, { checkInDate: result.date, checkOutDate: '2026-10-10', guestCount: 1 });
  expect(result.availableRooms).toBe(rooms.length);
  expect(result.occupiedRooms).toBe(await db.prisma.room.count({ where: { active: true, status: 'occupied' } }));
  expect(result.arrivalsToday).toBe(await db.prisma.booking.count({ where: { checkInDate: result.date, status: { not: 'cancelled' } } }));
  expect(result.departuresToday).toBe(await db.prisma.booking.count({ where: { checkOutDate: result.date, status: { not: 'cancelled' } } }));
  expect(hotelToday(new Date('2026-10-08T16:59:59Z'))).toBe('2026-10-08');
});

test('dashboard role and query guards; admin report equals real ledger aggregates', async () => {
  await request(app).get('/api/dashboard').expect(401);
  await request(app).get('/api/dashboard').set(auth()).query({ date: 'bad' }).expect(400);
  const report = (await request(app).get('/api/dashboard/report').set(auth()).expect(200)).body;
  const rows = await db.prisma.paymentTransaction.findMany();
  const sum = kind => rows.filter(r => r.kind === kind).reduce((n, r) => n + r.amount, 0);
  expect(report).toMatchObject({ receivedBaht: sum('receive'), refundedBaht: sum('refund'), netBaht: sum('receive') - sum('refund') });
  await db.prisma.user.update({ where: { email: 'task5@example.test' }, data: { role: 'receptionist' } });
  await request(app).get('/api/dashboard').set(auth()).expect(200);
  await request(app).get('/api/dashboard/report').set(auth()).expect(403);
});

test('public fields, query validation, and rate limit', async () => {
  const query = { checkInDate: '2027-01-01', checkOutDate: '2027-01-02', guestCount: 1 };
  const response = await request(app).get('/api/public/rooms/availability').query(query).expect(200);
  expect(response.body.items.length).toBeGreaterThan(0);
  for (const room of response.body.items) expect(Object.keys(room).sort()).toEqual(['capacity', 'pricePerNight', 'roomId', 'roomNumber', 'roomType']);
  await request(app).get('/api/public/rooms/availability').query({ ...query, guestCount: -1 }).expect(400);
  await request(app).get('/api/public/rooms/availability').query({ ...query, limit: 101 }).expect(400);
  await request(app).get('/api/public/rooms/availability').query({ ...query, token: 'secret' }).expect(400);
  for (let i = 4; i < 60; i++) await request(app).get('/api/public/rooms/availability').expect(400);
  expect((await request(app).get('/api/public/rooms/availability').expect(429)).headers['retry-after']).toBeDefined();
});

test('security headers, body/query bounds, readiness and public CORS', async () => {
  const previous = process.env.PUBLIC_CORS_ORIGINS; process.env.PUBLIC_CORS_ORIGINS = 'https://consumer.example';
  try {
    const allowed = await request(app).options('/api/public/rooms/availability').set('Origin', 'https://consumer.example').expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://consumer.example');
    expect((await request(app).options('/api/public/rooms/availability').set('Origin', 'https://evil.example').expect(204)).headers['access-control-allow-origin']).toBeUndefined();
  } finally { if (previous === undefined) delete process.env.PUBLIC_CORS_ORIGINS; else process.env.PUBLIC_CORS_ORIGINS = previous; }
  const health = await request(app).get('/health').expect(200);
  expect(health.headers['x-frame-options']).toBe('DENY'); expect(health.headers['cache-control']).toBe('no-store');
  await request(app).get('/health?q=' + 'a'.repeat(4100)).expect(414);
  await request(app).post('/api/auth/login').send({ password: 'x'.repeat(66000) }).expect(400);
  await request(app).get('/ready').expect(200);
  app.locals.draining = true; await request(app).get('/ready').expect(503);
  const broken = createApp({ $runCommandRaw: async () => { throw new Error('private database URL'); } });
  expect((await request(broken).get('/ready').expect(503)).body).toEqual({ status: 'unavailable' });
});

test('limiter expires and production database guard rejects unsafe URL', () => {
  let now = 0; const limiter = rateLimit({ limit: 1, windowMs: 100, clock: () => now });
  const next = jest.fn(); const res = { set: jest.fn() };
  limiter({ ip: 'one' }, res, next); limiter({ ip: 'one' }, res, next);
  expect(next.mock.calls[1][0].status).toBe(429);
  now = 101; limiter({ ip: 'one' }, res, next); expect(next.mock.calls[2]).toEqual([]);
  expect(() => assertTestUrl('mongodb://127.0.0.1:27018/hotel_lobby?replicaSet=rs0')).toThrow();
});

test('delivered Postman collection executes all 17 requests against real HTTP', async () => {
  const collection = require('../../docs/hotel-lobby.postman_collection.json');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const values = Object.fromEntries(collection.variable.map(v => [v.key, v.value]));
  Object.assign(values, { baseUrl: `http://127.0.0.1:${server.address().port}`, email: 'task5@example.test', password: 'task5-password-123' });
  const interpolate = value => value.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key]);
  try {
    for (const item of collection.item) {
      const pm = { info: { requestName: item.name }, collectionVariables: { set: (key, value) => { values[key] = value; } } };
      for (const event of collection.event) new Function('pm', event.script.exec.join('\n'))(pm);
      const req = item.request;
      const response = await fetch(interpolate(req.url), { method: req.method,
        headers: Object.fromEntries(req.header.map(h => [h.key, interpolate(h.value)])),
        ...(req.body ? { body: interpolate(req.body.raw) } : {}) });
      const text = await response.text();
      pm.response = { code: response.status, json: () => JSON.parse(text), to: { have: { status: expected => expect(response.status).toBe(expected) } } };
      pm.test = (_name, fn) => fn();
      for (const event of item.event) new Function('pm', event.script.exec.join('\n'))(pm);
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
