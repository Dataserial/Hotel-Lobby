const { spawnSync } = require('child_process');
const { MongoMemoryReplSet } = require('mongodb-memory-server-core');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { createApp } = require('../app');

let mongo, prisma, app, adminToken, receptionToken, adminId, testUrl;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    binary: process.env.MONGOD_PATH ? { systemBinary: process.env.MONGOD_PATH } : undefined,
    replSet: { count: 1, name: 'task12set', storageEngine: 'wiredTiger' },
  });
  const url = mongo.getUri('hotel_lobby_task12_test');
  testUrl = url;
  if (!/\/hotel_lobby_task12_test\?/.test(url)) throw new Error('Unsafe test database URL');
  const push = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push'], {
    cwd: require('path').join(__dirname, '..'), env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8', timeout: 120000,
  });
  if (push.status !== 0) throw new Error(`Test schema push failed: ${push.stdout}\n${push.stderr}`);
  prisma = new PrismaClient({ datasources: { db: { url } } });
  app = createApp(prisma);
  const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin@test.example', passwordHash: await bcrypt.hash('admin-password-123', 12), role: 'admin' } });
  adminId = admin.id;
  await prisma.user.create({ data: { name: 'Desk', email: 'desk@test.example', passwordHash: await bcrypt.hash('desk-password-123', 12), role: 'receptionist' } });
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'admin@test.example', password: 'admin-password-123' })).body.token;
  receptionToken = (await request(app).post('/api/auth/login').send({ email: 'desk@test.example', password: 'desk-password-123' })).body.token;
}, 900000);

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (mongo) await mongo.stop();
}, 30000);

test('auth: invalid login, me, permissions, logout revokes token', async () => {
  expect((await request(app).post('/api/auth/login').send({ email: 'admin@test.example', password: 'wrong-password' })).status).toBe(401);
  expect((await request(app).get('/api/users')).status).toBe(401);
  expect((await request(app).get('/api/users').set(auth(receptionToken))).status).toBe(403);
  const me = await request(app).get('/api/auth/me').set(auth(adminToken));
  expect(me.status).toBe(200);
  expect(me.body.user.passwordHash).toBeUndefined();
  const token = (await request(app).post('/api/auth/login').send({ email: 'admin@test.example', password: 'admin-password-123' })).body.token;
  expect((await request(app).post('/api/auth/logout').set(auth(token))).status).toBe(204);
  expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(401);
  expect((await request(app).get('/api/guests/000000000000000000000001').set(auth(adminToken))).status).toBe(404);
});

test('users: admin CRUD, duplicate, pagination, last self-admin guard, inactive login', async () => {
  const created = await request(app).post('/api/users').set(auth(adminToken)).send({ name: 'New Desk', email: 'NEW@TEST.EXAMPLE', password: 'long-password-123', role: 'receptionist' });
  expect(created.status).toBe(201);
  expect(created.body.email).toBe('new@test.example');
  expect(JSON.stringify(created.body)).not.toContain('passwordHash');
  expect((await request(app).post('/api/users').set(auth(adminToken)).send({ name: 'Again', email: 'new@test.example', password: 'long-password-123', role: 'receptionist' })).status).toBe(409);
  expect((await request(app).get('/api/users?limit=1&page=1').set(auth(adminToken))).body.items).toHaveLength(1);
  expect((await request(app).patch(`/api/users/${adminId}`).set(auth(adminToken)).send({ active: false })).status).toBe(409);
  const newToken = (await request(app).post('/api/auth/login').send({ email: 'new@test.example', password: 'long-password-123' })).body.token;
  expect((await request(app).post(`/api/users/${created.body.id}/deactivate`).set(auth(adminToken))).status).toBe(200);
  expect((await request(app).post('/api/auth/login').send({ email: 'new@test.example', password: 'long-password-123' })).status).toBe(401);
  expect((await request(app).get('/api/auth/me').set(auth(newToken))).status).toBe(401);
});

test('room types and rooms: validation, roles, legacy number, references, occupied guard', async () => {
  expect((await request(app).post('/api/room-types').set(auth(receptionToken)).send({ name: 'Standard', capacity: 2, basePrice: 1000 })).status).toBe(403);
  const type = await request(app).post('/api/room-types').set(auth(adminToken)).send({ name: 'Standard', capacity: 2, basePrice: 1000, amenities: ['Wi-Fi'] });
  expect(type.status).toBe(201);
  expect(type.body.createdById).toBe(adminId);
  expect((await request(app).post('/api/room-types').set(auth(adminToken)).send({ name: 'standard', capacity: 2, basePrice: 1000 })).status).toBe(409);
  expect((await request(app).post('/api/rooms').set(auth(adminToken)).send({ roomNumber: '101', floor: 1, roomTypeId: type.body.id, status: 'occupied' })).status).toBe(400);
  const room = await request(app).post('/api/rooms').set(auth(adminToken)).send({ roomNumber: '101', floor: 1, roomTypeId: type.body.id });
  expect(room.status).toBe(201);
  expect(room.body.roomNumber).toBe('101');
  expect(room.body.number).toBeUndefined();
  expect((await request(app).get('/api/rooms?q=10').set(auth(receptionToken))).body.items).toHaveLength(1);
  expect((await request(app).patch(`/api/room-types/${type.body.id}`).set(auth(adminToken)).send({ active: false })).status).toBe(409);
  expect((await request(app).delete(`/api/room-types/${type.body.id}`).set(auth(adminToken))).status).toBe(409);
  await prisma.room.update({ where: { id: room.body.id }, data: { status: 'occupied' } });
  expect((await request(app).patch(`/api/rooms/${room.body.id}`).set(auth(adminToken)).send({ status: 'available' })).status).toBe(409);
  const legacy = await prisma.room.create({ data: { number: 'OLD-1', status: null, active: null } });
  expect((await request(app).get(`/api/rooms/${legacy.id}`).set(auth(receptionToken))).body.roomNumber).toBe('OLD-1');
});

test('guests: search, masking, duplicate, archive with booking reference, validation rollback', async () => {
  const created = await request(app).post('/api/guests').set(auth(receptionToken)).send({ fullName: 'Jane Doe', phone: '+66812345678', documentNo: 'Passport 1234' });
  expect(created.status).toBe(201);
  expect(created.body.documentNo).toBeUndefined();
  expect(created.body.documentNoMasked).toBe('***1234');
  const query = await request(app).get('/api/guests?documentNo=passport1234').set(auth(receptionToken));
  expect(query.body.items).toHaveLength(1);
  expect(JSON.stringify(query.body)).not.toContain('Passport 1234');
  expect((await request(app).get('/api/guests').set(auth(adminToken))).body.items[0].documentNo).toBeUndefined();
  expect((await request(app).post('/api/guests').set(auth(adminToken)).send({ fullName: 'Duplicate', phone: '+66812345679', documentNo: 'PASSPORT1234' })).status).toBe(409);
  expect((await request(app).patch(`/api/guests/${created.body.id}`).set(auth(receptionToken)).send({ phone: 'bad' })).status).toBe(400);
  expect((await request(app).get(`/api/guests/${created.body.id}`).set(auth(adminToken))).body.phone).toBe('+66812345678');
  const type = await prisma.roomType.findUnique({ where: { nameKey: 'standard' } });
  const room = await prisma.room.create({ data: { number: '102', roomTypeId: type.id, status: 'available', active: true } });
  await prisma.booking.create({ data: {
    guestId: created.body.id, roomId: room.id, guestCount: 1, checkInDate: '2026-11-01', checkOutDate: '2026-11-02',
    pricePerNight: 1000, totalPrice: 1000, createdById: adminId, updatedById: adminId,
  } });
  const archived = await request(app).delete(`/api/guests/${created.body.id}`).set(auth(receptionToken));
  expect(archived.status).toBe(200);
  expect(archived.body.active).toBe(false);
  expect((await request(app).get(`/api/guests/${created.body.id}`).set(auth(adminToken))).body.active).toBe(false);
  expect((await request(app).delete(`/api/rooms/${room.id}`).set(auth(adminToken))).status).toBe(409);
});

test('demo seed can rerun without duplicates on guarded test DB', async () => {
  const env = { ...process.env, DATABASE_URL: testUrl, DEMO_ADMIN_EMAIL: 'seed@test.example', DEMO_ADMIN_PASSWORD: 'seed-password-123' };
  const script = require('path').join(__dirname, '..', 'scripts', 'seed-demo.js');
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8', timeout: 30000 });
    expect(result.status).toBe(0);
  }
  expect(await prisma.user.count({ where: { email: 'seed@test.example' } })).toBe(1);
  expect(await prisma.room.count({ where: { number: 'DEMO-101' } })).toBe(1);
});
