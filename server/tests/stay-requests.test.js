// ทดสอบการส่งคำขอเข้าพักและสิทธิ์เจ้าของคำขอ
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const { startDatabase } = require('./task3-db');

let db, app, memberToken, otherToken, staffToken, roomType;
const auth = token => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { db = await startDatabase('hotel_lobby_task5_test'); }, 180000);
beforeEach(async () => {
  await db.reset(); app = createApp(db.prisma);
  const passwordHash = await bcrypt.hash('stay-request-password-123', 10);
  const [member, other, staff] = await Promise.all([
    db.prisma.user.create({ data: { name: 'Member', email: 'stay-member@example.test', passwordHash, role: 'customer' } }),
    db.prisma.user.create({ data: { name: 'Other', email: 'stay-other@example.test', passwordHash, role: 'customer' } }),
    db.prisma.user.create({ data: { name: 'Staff', email: 'stay-staff@example.test', passwordHash, role: 'receptionist' } }),
  ]);
  roomType = await db.prisma.roomType.create({ data: { name: 'Stay Request Type', nameKey: 'stay-request-type', capacity: 2, basePrice: 1200, amenities: [] } });
  await db.prisma.room.create({ data: { number: 'REQUEST-101', roomTypeId: roomType.id, status: 'available', active: true } });
  // เข้าสู่ระบบแล้วเก็บ session ที่ได้รับ
  const login = user => request(app).post('/api/auth/login').send({ email: user.email, password: 'stay-request-password-123' });
  memberToken = (await login(member)).body.token; otherToken = (await login(other)).body.token; staffToken = (await login(staff)).body.token;
});
afterAll(async () => { if (db) await db.stop(); }, 30000);

test('member request persists server-priced service snapshots and is visible only to its owner and staff', async () => {
  const service = await db.prisma.additionalService.create({ data: { name: 'ผ้าเช็ดตัวเพิ่ม', nameKey: 'extra-towels', unit: 'per_stay', price: 80, active: true, maxQuantity: 3 } });
  const payload = { clientRequestId: 'stay-request-idempotency-0001', contactName: 'Member', contactPhone: '0812345678', checkInDate: '2027-02-01', checkOutDate: '2027-02-03', guestCount: 2, roomTypeId: roomType.id, services: [{ serviceId: service.id, quantity: 2 }], notes: 'แพ้ฝุ่น' };
  const created = await request(app).post('/api/stay-requests').set(auth(memberToken)).send(payload).expect(201);
  expect(created.body).toMatchObject({ memberId: expect.any(String), status: 'new', roomTypeId: roomType.id, services: [{ serviceId: service.id, quantity: 2, price: 80, unit: 'per_stay' }] });
  expect(created.body.estimatedServiceTotal).toBe(160);
  await request(app).post('/api/stay-requests').set(auth(memberToken)).send(payload).expect(200).expect(r => expect(r.body.id).toBe(created.body.id));
  await request(app).get('/api/stay-requests/' + created.body.id).set(auth(otherToken)).expect(404);
  const staffRead = await request(app).get('/api/stay-requests/' + created.body.id).set(auth(staffToken)).expect(200);
  expect(staffRead.body.services).toHaveLength(1);
});
