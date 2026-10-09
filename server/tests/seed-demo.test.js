const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const { startDatabase } = require('./task3-db');
const { demoConfig, seedDemo } = require('../scripts/seed-demo');
const { hotelToday } = require('../services/stay-service');

let db;
beforeAll(async () => { db = await startDatabase('hotel_lobby_task5_test'); }, 180000);
afterAll(async () => { if (db) await db.stop(); }, 30000);

test('seed rejects production targets and weak or missing credentials', () => {
  const credentials = { DEMO_ADMIN_EMAIL: 'admin@example.test', DEMO_ADMIN_PASSWORD: 'long-demo-password' };
  expect(() => demoConfig({ ...credentials, DATABASE_URL: 'mongodb://atlas.example/hotel_lobby_demo' })).toThrow();
  expect(() => demoConfig({ ...credentials, DATABASE_URL: 'mongodb://127.0.0.1:27018/hotel_lobby' })).toThrow();
  expect(() => demoConfig({ ...credentials, DEMO_ADMIN_PASSWORD: 'short', DATABASE_URL: 'mongodb://127.0.0.1:27018/hotel_lobby_demo' })).toThrow();
});

test('seed creates a usable room catalog and preserves edits on rerun', async () => {
  const credentials = { email: 'demo-admin@example.test', password: 'long-demo-password' };
  const seeded = await seedDemo(db.prisma, credentials);
  expect(seeded).toMatchObject({ typeCount: 3, roomCount: 9 });
  expect(await db.prisma.user.count()).toBe(1);
  expect(await db.prisma.roomType.count()).toBe(3);
  expect(await db.prisma.room.count()).toBe(9);
  const edited = await db.prisma.room.update({ where: { number: 'DEMO-103' }, data: { status: 'maintenance' } });
  const hash = (await db.prisma.user.findUnique({ where: { email: credentials.email } })).passwordHash;
  await seedDemo(db.prisma, credentials);
  expect(await db.prisma.user.count()).toBe(1);
  expect(await db.prisma.roomType.count()).toBe(3);
  expect(await db.prisma.room.count()).toBe(9);
  expect((await db.prisma.room.findUnique({ where: { id: edited.id } })).status).toBe('maintenance');
  expect((await db.prisma.user.findUnique({ where: { email: credentials.email } })).passwordHash).toBe(hash);
  expect(await bcrypt.compare(credentials.password, hash)).toBe(true);
  await expect(seedDemo(db.prisma, { ...credentials, password: 'another-demo-password' }))
    .rejects.toThrow('different password');
  await db.prisma.user.update({ where: { email: credentials.email }, data: { active: false } });
  await expect(seedDemo(db.prisma, credentials)).rejects.toThrow('inactive');
  await db.prisma.user.update({ where: { email: credentials.email }, data: { active: true } });

  const app = createApp(db.prisma);
  const token = (await request(app).post('/api/auth/login').send(credentials).expect(200)).body.token;
  const checkInDate = hotelToday(new Date());
  const next = new Date(`${checkInDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const stay = { checkInDate, checkOutDate: next.toISOString().slice(0, 10), guestCount: 4 };
  const availability = (await request(app).get('/api/public/rooms/availability').query(stay).expect(200)).body;
  expect(availability.items.map((room) => room.roomNumber)).toEqual(['DEMO-301', 'DEMO-302', 'DEMO-303']);
  const guest = (await request(app).post('/api/guests').set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Seed Guest', phone: '0812345678', documentNo: 'SEED-DEMO-GUEST' }).expect(201)).body;
  const booking = (await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
    .send({ ...stay, guestId: guest.id, roomId: availability.items[0].roomId }).expect(201)).body;
  expect(booking.totalPrice).toBe(2600);
  expect((await request(app).get('/api/public/rooms/availability').query(stay).expect(200)).body.items.map((room) => room.roomId))
    .not.toContain(booking.roomId);
});
