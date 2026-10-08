const { startDatabase, sample } = require('./task3-db');
const { auditPayments, reconcilePayment } = require('../services/payment-reconciliation');
let db;
const actorId = sample.users[1]._id;
const bookingId = sample.bookings[1]._id;
const evidence = (transactions = []) => ({ verified: true, bookingId, transactions });
const receipt = (amount = 100) => ({
  id: '710000000000000000000001', recordedById: actorId, kind: 'receive',
  amount, method: 'cash', reference: 'VERIFIED-TEST-VOUCHER', idempotencyKey: 'import-test',
  occurredAt: '2026-01-01T00:00:00Z',
});
beforeAll(async () => { db = await startDatabase('hotel_lobby_task4_test'); }, 180000);
beforeEach(async () => db.reset());
afterAll(async () => { if (db) await db.stop(); }, 30000);

test('audit is read only; verified zero balances can be enabled and repeated', async () => {
  await db.prisma.payment.update({ where: { bookingId }, data: { ledgerReady: false } });
  expect((await auditPayments(db.prisma)).issues).toContainEqual({ bookingId, code: 'PAYMENT_RECONCILIATION_REQUIRED' });
  expect((await db.prisma.payment.findUnique({ where: { bookingId } })).ledgerReady).toBe(false);
  await reconcilePayment(db.prisma, evidence(), actorId);
  await reconcilePayment(db.prisma, evidence(), actorId);
  expect((await auditPayments(db.prisma)).issues).toEqual([]);
  expect(await db.prisma.paymentTransaction.count()).toBe(1); // synthetic sample receipt only
});
test('verified real evidence imports once; missing or differing evidence rolls back', async () => {
  await db.prisma.payment.update({ where: { bookingId }, data: { ledgerReady: false, paidAmount: 100 } });
  await expect(reconcilePayment(db.prisma, evidence(), actorId)).rejects.toMatchObject({ code: 'PAYMENT_INCONSISTENT' });
  await expect(reconcilePayment(db.prisma, evidence([receipt(99)]), actorId)).rejects.toMatchObject({ code: 'PAYMENT_INCONSISTENT' });
  expect(await db.prisma.paymentTransaction.count({ where: { reference: 'VERIFIED-TEST-VOUCHER' } })).toBe(0);
  await reconcilePayment(db.prisma, evidence([receipt()]), actorId);
  await reconcilePayment(db.prisma, evidence([receipt()]), actorId);
  expect(await db.prisma.paymentTransaction.count({ where: { reference: 'VERIFIED-TEST-VOUCHER' } })).toBe(1);
  await expect(reconcilePayment(db.prisma, evidence([{ ...receipt(), reference: 'changed' }]), actorId))
    .rejects.toMatchObject({ code: 'PAYMENT_INCONSISTENT' });
  expect((await auditPayments(db.prisma)).issues).toEqual([]);
});
test('database unique indexes reject duplicate keys and evidence across payments', async () => {
  const source = await db.prisma.paymentTransaction.findFirst();
  const other = await db.prisma.payment.findUnique({ where: { bookingId } });
  const { id, createdAt, ...data } = source;
  await expect(db.prisma.paymentTransaction.create({ data: { ...data, paymentId: other.id, reference: 'other' } }))
    .rejects.toMatchObject({ code: 'P2002' });
  await expect(db.prisma.paymentTransaction.create({ data: { ...data, paymentId: other.id, idempotencyKey: 'other' } }))
    .rejects.toMatchObject({ code: 'P2002' });
});
