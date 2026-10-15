// ทดสอบการเข้าสู่ระบบและสิทธิ์ผู้ใช้
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const { startDatabase } = require('./task3-db');
const crypto = require('crypto');
const { hashToken } = require('../lib/auth');
let db, app, token;
const auth = () => ({ Authorization: `Bearer ${token}` });
beforeAll(async () => { db = await startDatabase('hotel_lobby_task5_test'); }, 180000);
beforeEach(async () => {
  await db.reset(); app = createApp(db.prisma);
  await db.prisma.user.create({ data: { name: 'Audit admin', email: 'audit-auth@example.test', passwordHash: await bcrypt.hash('audit-password-123', 10), role: 'admin' } });
  token = (await request(app).post('/api/auth/login').send({ email: 'audit-auth@example.test', password: 'audit-password-123' }).expect(200)).body.token;
});
afterAll(async () => { if (db) await db.stop(); }, 30000);

test('password byte boundary rejects silent bcrypt truncation', async () => {
  for (const password of ['x'.repeat(73), 'ก'.repeat(25)]) {
    await request(app).post('/api/users').set(auth()).send({ name: 'Long', email: 'long@example.test', password, role: 'receptionist' }).expect(400);
  }
  const prefix = 'x'.repeat(71);
  await request(app).post('/api/users').set(auth()).send({ name: 'Boundary', email: 'boundary@example.test', password: prefix + 'A', role: 'receptionist' }).expect(201);
  await request(app).post('/api/auth/login').send({ email: 'boundary@example.test', password: prefix + 'A' }).expect(200);
  await request(app).post('/api/auth/login').send({ email: 'boundary@example.test', password: prefix + 'B' }).expect(401);
  const invalid = await request(app).post('/api/auth/login').send({ email: 'boundary@example.test', password: prefix + 'AB' });
  expect(invalid.status).toBe(400);
});

test('password whitespace roundtrips exactly, never silently normalizes', async () => {
  const password = ' spaces-password-123 ';
  await request(app).post('/api/users').set(auth()).send({ name: 'Spaces', email: 'spaces@example.test', password, role: 'receptionist' }).expect(201);
  await request(app).post('/api/auth/login').send({ email: 'spaces@example.test', password }).expect(200);
  await request(app).post('/api/auth/login').send({ email: 'spaces@example.test', password: password.trim() }).expect(401);
});

test('password change atomically revokes only the target account sessions', async () => {
  const user = (await request(app).post('/api/users').set(auth()).send({ name: 'Change', email: 'change@example.test', password: 'original-password-123', role: 'receptionist' }).expect(201)).body;
  const targetToken = (await request(app).post('/api/auth/login').send({ email: user.email, password: 'original-password-123' }).expect(200)).body.token;
  await request(app).patch(`/api/users/${user.id}`).set(auth()).send({ password: 'replacement-password-123' }).expect(200);
  await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${targetToken}` }).expect(401);
  await request(app).get('/api/auth/me').set(auth()).expect(200);
  expect(await db.prisma.session.count({ where: { userId: user.id } })).toBe(0);
  await request(app).post('/api/auth/login').send({ email: user.email, password: 'replacement-password-123' }).expect(200);
});

test.each(['receptionist', 'customer'])('an active administrator cannot change their own role to %s', async role => {
  const me = (await request(app).get('/api/auth/me').set(auth()).expect(200)).body.user;
  const result = await request(app).patch('/api/users/' + me.id).set(auth()).send({ role }).expect(409);
  expect(result.body.error.code).toBe('SELF_ADMIN_CHANGE');
  expect((await db.prisma.user.findUnique({ where: { id: me.id } })).role).toBe('admin');
});

test('simultaneous customer demotions cannot remove both active administrators', async () => {
  const me = (await request(app).get('/api/auth/me').set(auth()).expect(200)).body.user;
  const other = await db.prisma.user.findFirst({ where: { role: 'admin', id: { not: me.id } } });
  const otherToken = crypto.randomBytes(32).toString('base64url');
  await db.prisma.session.create({ data: { userId: other.id, tokenHash: hashToken(otherToken), expiresAt: new Date(Date.now() + 3600000) } });
  const results = await Promise.all([
    request(app).patch('/api/users/' + other.id).set(auth()).send({ role: 'customer' }),
    request(app).patch('/api/users/' + me.id).set('Authorization', 'Bearer ' + otherToken).send({ role: 'customer' }),
  ]);
  expect(results.filter(result => result.status === 200)).toHaveLength(1);
  expect(results.filter(result => [403, 409].includes(result.status))).toHaveLength(1);
  expect(await db.prisma.user.count({ where: { role: 'admin', active: true } })).toBe(1);
});

test('service definitions support complete CRUD fields and reject dangling room type references', async () => {
  const type = (await request(app).post('/api/room-types').set(auth()).send({ name: 'Service Type', capacity: 2, basePrice: 1200, supportsExtraBed: true }).expect(201)).body;
  expect(type.supportsExtraBed).toBe(true);
  const fields = { name: 'Extra bed', unit: 'per_night', price: 300, included: false, extraBed: true, roomTypeIds: [type.id], maxQuantity: 2 };
  const service = (await request(app).post('/api/additional-services').set(auth()).send(fields).expect(201)).body;
  expect(service).toMatchObject({ ...fields, active: true });
  await request(app).delete('/api/room-types/' + type.id).set(auth()).expect(409);
  const updated = (await request(app).patch('/api/additional-services/' + service.id).set(auth()).send({ ...fields, unit: 'per_set', price: null, maxQuantity: 3, active: false, included: true }).expect(200)).body;
  expect(updated).toMatchObject({ unit: 'per_set', price: null, maxQuantity: 3, active: false, included: true });
  const rejected = await request(app).patch('/api/additional-services/' + service.id).set(auth()).send({ roomTypeIds: ['ffffffffffffffffffffffff'] }).expect(400);
  expect(rejected.body.error.code).toBe('INVALID_REFERENCE');
  expect((await db.prisma.additionalService.findUnique({ where: { id: service.id } })).roomTypeIds).toEqual([type.id]);
  await request(app).post('/api/additional-services').set(auth()).send({ ...fields, name: 'Unknown reference', roomTypeIds: ['ffffffffffffffffffffffff'] }).expect(400);
});
