const { startDatabase, sample } = require('./task3-db');
const { receivePayment, refundPayment } = require('../services/payment-service');
const { auditPayments } = require('../services/payment-reconciliation');
let db;
const actorId = sample.users[1]._id;
const bookingId = sample.bookings[1]._id;
const input = (amount, reference = 'receipt', method = 'cash') => ({ amount, method, reference, occurredAt: '2026-01-01T00:00:00Z' });
const receive = (amount, reference = 'receipt', key = reference, prisma = db.prisma) =>
  receivePayment(prisma, bookingId, input(amount, reference), key, actorId);
const refund = (receiptId, amount, reference = 'refund', key = reference) =>
  refundPayment(db.prisma, bookingId, { ...input(amount, reference), receiptId, reason: 'Guest requested refund' }, key, actorId);
beforeAll(async () => { db = await startDatabase('hotel_lobby_task4_test'); }, 180000);
beforeEach(async () => db.reset());
afterAll(async () => { if (db) await db.stop(); }, 30000);

test('multiple methods and installments; partial/full refund retains source history', async () => {
  const a = (await receive(1000)).transaction;
  const b = (await receivePayment(db.prisma, bookingId, input(2600, 'bank', 'bank_transfer'), 'bank', actorId)).transaction;
  expect(await db.prisma.payment.findUnique({ where: { bookingId } })).toMatchObject({ status: 'paid', paidAmount: 3600, method: 'bank_transfer' });
  await refund(a.id, 400);
  await expect(refund(a.id, 601, 'too-much')).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_RECEIPT' });
  await refund(a.id, 600, 'refund-rest');
  await refund(b.id, 2600, 'refund-bank');
  await receive(3600, 'again');
  expect(await db.prisma.payment.findUnique({ where: { bookingId } })).toMatchObject({ status: 'paid', paidAmount: 7200, refundedAmount: 3600 });
  expect((await auditPayments(db.prisma)).issues).toEqual([]);
});
test('replay returns original immutable transaction; changed data/key-reference reuse conflict', async () => {
  const first = await receive(1000);
  expect(await receive(1000)).toEqual({ transaction: first.transaction, replayed: true });
  await expect(receive(999)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(receive(1000, 'receipt', 'different-key')).rejects.toMatchObject({ code: 'DUPLICATE_REFERENCE' });
  await refund(first.transaction.id, 1000);
  await db.prisma.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } });
  // Replay bypasses current transition guards, and preserves the original recorder.
  expect((await receive(1000)).transaction).toEqual(first.transaction);
  await db.prisma.user.update({ where: { id: actorId }, data: { active: false } });
  await expect(receive(1000)).rejects.toMatchObject({ code: 'INVALID_ACTOR' });
});
test('state, evidence, source and cumulative guards block invalid writes', async () => {
  await expect(receive(3601)).rejects.toMatchObject({ code: 'PAYMENT_EXCEEDS_REMAINING' });
  const otherReceipt = await db.prisma.paymentTransaction.findFirst();
  await expect(refund(otherReceipt.id, 1)).rejects.toMatchObject({ code: 'INVALID_RECEIPT' });
  const a = (await receive(100)).transaction;
  await db.prisma.booking.update({ where: { id: bookingId }, data: { status: 'checked_in' } });
  await expect(refund(a.id, 1)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  await db.prisma.booking.update({ where: { id: bookingId }, data: { status: 'confirmed' } });
  await db.prisma.payment.update({ where: { bookingId }, data: { paidAmount: 101 } });
  await expect(receive(1, 'corrupt')).rejects.toMatchObject({ code: 'PAYMENT_INCONSISTENT' });
  await db.prisma.payment.update({ where: { bookingId }, data: { ledgerReady: false } });
  await expect(receive(1, 'legacy')).rejects.toMatchObject({ code: 'PAYMENT_RECONCILIATION_REQUIRED' });
});
test('checked-in bookings may finish payment, checked-out bookings cannot receive', async () => {
  await db.prisma.booking.update({ where: { id: bookingId }, data: { status: 'checked_in' } });
  await receive(3600);
  await db.prisma.booking.update({ where: { id: bookingId }, data: { status: 'checked_out' } });
  await expect(receive(1, 'closed')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
});
