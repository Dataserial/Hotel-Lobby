const crypto = require('crypto');
const request = require('supertest');
const { createApp } = require('../app');
const { hashToken } = require('../lib/auth');
const { startDatabase, sample } = require('./task3-db');
const { createBooking } = require('../services/booking-service');
let db, app, token;
const actorId = sample.users[1]._id;
const bookingId = sample.bookings[1]._id;
const path = `/api/bookings/${bookingId}`;
const receipt = { amount: 1000, method: 'cash', reference: 'CASH-VOUCHER-1', occurredAt: '2026-01-01T00:00:00Z' };
const send = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
beforeAll(async () => { db = await startDatabase('hotel_lobby_task4_test'); app = createApp(db.prisma); }, 180000);
beforeEach(async () => {
  await db.reset(); token = crypto.randomBytes(32).toString('base64url');
  await db.prisma.session.create({ data: { userId: actorId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
});
afterAll(async () => { if (db) await db.stop(); }, 30000);
test('every operation requires authentication, including replay; service checks role and activity', async () => {
  for (const [method, suffix] of [['get', '/payment'], ['get', '/payment/transactions'], ['post', '/payment/receipts'], ['post', '/payment/refunds'], ['post', '/check-in'], ['post', '/check-out']]) {
    await request(app)[method](`${path}${suffix}`).send({}).expect(401);
  }
  await send('post', `${path}/payment/receipts`).set('Idempotency-Key', 'key').send(receipt).expect(201);
  await db.prisma.user.update({ where: { id: actorId }, data: { active: false } });
  await send('post', `${path}/payment/receipts`).set('Idempotency-Key', 'key').send(receipt).expect(401);
});
test.each(['admin', 'receptionist'])('%s can record money; replay and audit output preserve actor', async (role) => {
  const userId = sample.users[role === 'admin' ? 0 : 1]._id;
  await db.prisma.session.updateMany({ data: { userId } });
  const first = await send('post', `${path}/payment/receipts`).set('Idempotency-Key', 'key').set('X-Actor-Id', 'forged').send(receipt).expect(201);
  const repeated = await send('post', `${path}/payment/receipts`).set('Idempotency-Key', 'key').send(receipt).expect(200);
  expect(repeated.body).toEqual(first.body);
  expect(first.body.recordedById).toBe(userId);
  await send('post', `${path}/payment/receipts`).set('Idempotency-Key', 'key').send({ ...receipt, amount: 1 }).expect(409);
  expect((await send('post', `${path}/payment/receipts`).set('Idempotency-Key', 'new').send(receipt).expect(409)).body.error.code).toBe('DUPLICATE_REFERENCE');
  const summary = (await send('get', `${path}/payment`).expect(200)).body;
  expect(summary).toMatchObject({ net: 1000, remaining: 2600, ledgerReady: true });
  const rows = (await send('get', `${path}/payment/transactions`).query({ page: 1, limit: 1 }).expect(200)).body;
  expect(rows).toMatchObject({ total: 1, page: 1, limit: 1, items: [first.body] });
  for (const body of [summary, first.body]) for (const field of ['guest', 'user', 'recordedBy', 'passwordHash', 'documentNo', 'payment', 'booking']) expect(body).not.toHaveProperty(field);
  await send('post', `${path}/payment/refunds`).set('Idempotency-Key', 'refund').send({ ...receipt, receiptId: first.body.id, reason: 'Cancel stay', reference: 'REFUND-VOUCHER' }).expect(201);
  await send('post', `${path}/cancel`).send({}).expect(200);
  expect((await send('get', `${path}/payment`).expect(200)).body).toMatchObject({ status: 'refunded', net: 0 });
  await send('post', `${path}/payment/receipts`).set('Idempotency-Key', 'key').send(receipt).expect(200);
});
test('malformed, unknown, forged and direct cumulative fields are rejected', async () => {
  const url = `${path}/payment/receipts`;
  await send('post', url).send(receipt).expect(400);
  for (const extra of [{ paidAmount: 1 }, { refundedAmount: 1 }, { actorId }, { status: 'paid' }, { cardNumber: '1234' }]) {
    await send('post', url).set('Idempotency-Key', 'key').send({ ...receipt, ...extra }).expect(400);
  }
  for (const payload of [[], null, { ...receipt, amount: '1000' }, { ...receipt, method: 'crypto' }, { ...receipt, reference: '  ' }, { ...receipt, occurredAt: '2026-02-30T00:00:00Z' }]) {
    await send('post', url).set('Idempotency-Key', 'key').send(payload).expect(400);
  }
  for (const suffix of ['/check-in', '/check-out']) await send('post', `${path}${suffix}`).send({ actualCheckInAt: '2026-01-01' }).expect(400);
  await send('get', `${path}/payment`).query({ extra: 1 }).expect(400);
  await send('get', `${path}/payment/transactions`).query({ limit: 101 }).expect(400);
  await send('patch', `${path}/payment`).send({ paidAmount: 1 }).expect(404);
  expect(await db.prisma.paymentTransaction.count()).toBe(1);
});
test('invalid references and business errors retain the common error envelope', async () => {
  const invalid = await send('get', '/api/bookings/bad/payment').expect(400);
  expect(invalid.body.error).toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR', message: expect.any(String), requestId: expect.any(String) }));
  await send('get', '/api/bookings/500000000000000000000099/payment').expect(404);
  const over = await send('post', `${path}/payment/receipts`).set('Idempotency-Key', 'key').send({ ...receipt, amount: 3601 }).expect(409);
  expect(over.body.error.code).toBe('PAYMENT_EXCEEDS_REMAINING');
});
test('check-in/out return existing booking allowlist and duplicate transitions conflict', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'hrtime', 'performance'] });
  jest.setSystemTime(new Date('2026-11-01T00:00:00Z'));
  try {
    await db.prisma.session.updateMany({ data: { expiresAt: new Date('2026-11-02T00:00:00Z') } });
    const b = await createBooking(db.prisma, { guestId: sample.guests[0]._id, roomId: sample.rooms[0]._id, guestCount: 2, checkInDate: '2026-11-01', checkOutDate: '2026-11-02' }, actorId);
    const base = `/api/bookings/${b.id}`;
    const entered = await send('post', `${base}/check-in`).send({}).expect(200);
    expect(entered.body).toMatchObject({ status: 'checked_in', updatedById: actorId });
    expect(entered.body).not.toHaveProperty('version');
    expect(entered.body).not.toHaveProperty('payment');
    await send('post', `${base}/check-in`).expect(409);
    expect((await send('post', `${base}/check-out`).expect(409)).body.error.code).toBe('PAYMENT_REQUIRED');
    await send('post', `${base}/payment/receipts`).set('Idempotency-Key', 'stay-paid').send({ ...receipt, amount: 1200 }).expect(201);
    await send('post', `${base}/check-out`).expect(200);
    await send('post', `${base}/check-out`).expect(409);
  } finally { jest.useRealTimers(); }
});
test('CORS permits Idempotency-Key for configured origins', async () => {
  const previous = process.env.CORS_ORIGINS; process.env.CORS_ORIGINS = 'https://hotel.example';
  try {
    const response = await request(app).options(`${path}/payment/receipts`).set('Origin', 'https://hotel.example').expect(204);
    expect(response.headers['access-control-allow-headers']).toContain('Idempotency-Key');
  } finally { if (previous === undefined) delete process.env.CORS_ORIGINS; else process.env.CORS_ORIGINS = previous; }
});
