const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const { startDatabase } = require('./task3-db');
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
