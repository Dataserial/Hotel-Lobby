const { startDatabase, sample } = require('./task3-db');
const { createBooking, updateBooking, cancelBooking } = require('../services/booking-service');
const { receivePayment, refundPayment } = require('../services/payment-service');
const { recordTestReceipt, recordTestRefund } = require('./payment-fixture');
const { auditPayments } = require('../services/payment-reconciliation');
let db;
const actorId = sample.users[1]._id;
const input = { guestId: sample.guests[0]._id, roomId: sample.rooms[0]._id, guestCount: 2, checkInDate: '2026-11-01', checkOutDate: '2026-11-03' };
beforeAll(async () => { db = await startDatabase('hotel_lobby_task4_test'); }, 180000);
beforeEach(async () => db.reset());
afterAll(async () => { if (db) await db.stop(); }, 30000);
test('refund then cancellation atomically sets refunded without erasing history', async () => {
  const b = await createBooking(db.prisma, input, actorId);
  expect(await db.prisma.payment.findUnique({ where: { bookingId: b.id } })).toMatchObject({ ledgerReady: true, paidAmount: 0 });
  const r = await recordTestReceipt(db.prisma, b.id, actorId);
  await expect(cancelBooking(db.prisma, b.id, actorId)).rejects.toMatchObject({ code: 'PAYMENT_REFUND_REQUIRED' });
  await recordTestRefund(db.prisma, b.id, actorId, r.id);
  await cancelBooking(db.prisma, b.id, actorId);
  expect(await db.prisma.payment.findUnique({ where: { bookingId: b.id } })).toMatchObject({ status: 'refunded', paidAmount: 100, refundedAmount: 100 });
  expect(await db.prisma.roomNightClaim.count({ where: { bookingId: b.id } })).toBe(0);
  expect((await auditPayments(db.prisma)).issues).toEqual([]);
});
test('full refund then lower price and collect again permits cumulative receipts above amount', async () => {
  const b = await createBooking(db.prisma, input, actorId);
  const r = await recordTestReceipt(db.prisma, b.id, actorId, 2400);
  await recordTestRefund(db.prisma, b.id, actorId, r.id, 2400);
  await updateBooking(db.prisma, b.id, { checkOutDate: '2026-11-02' }, actorId);
  await receivePayment(db.prisma, b.id, { amount: 1200, method: 'card', reference: 'new-payment', occurredAt: '2026-01-01T00:00:00Z' }, 'again', actorId);
  expect(await db.prisma.payment.findUnique({ where: { bookingId: b.id } })).toMatchObject({ amount: 1200, paidAmount: 3600, refundedAmount: 2400, status: 'paid' });
  expect((await auditPayments(db.prisma)).issues).toEqual([]);
});
test('legacy or inconsistent summary blocks edits and cancellation; zero never becomes refunded', async () => {
  const b = await createBooking(db.prisma, input, actorId);
  await db.prisma.payment.update({ where: { bookingId: b.id }, data: { ledgerReady: false } });
  await expect(updateBooking(db.prisma, b.id, { guestCount: 1 }, actorId)).rejects.toMatchObject({ code: 'PAYMENT_RECONCILIATION_REQUIRED' });
  await expect(cancelBooking(db.prisma, b.id, actorId)).rejects.toMatchObject({ code: 'PAYMENT_RECONCILIATION_REQUIRED' });
  await db.prisma.payment.update({ where: { bookingId: b.id }, data: { ledgerReady: true, paidAmount: 1 } });
  await expect(cancelBooking(db.prisma, b.id, actorId)).rejects.toMatchObject({ code: 'PAYMENT_INCONSISTENT' });
  await db.prisma.payment.update({ where: { bookingId: b.id }, data: { paidAmount: 0 } });
  await cancelBooking(db.prisma, b.id, actorId);
  expect((await db.prisma.payment.findUnique({ where: { bookingId: b.id } })).status).toBe('pending');
});
test('maximum Prisma Int receipt and refund work; cumulative overflow is rejected without writes', async () => {
  await db.prisma.roomType.update({ where: { nameKey: 'standard' }, data: { basePrice: 2147483647 } });
  const b = await createBooking(db.prisma, { ...input, checkOutDate: '2026-11-02' }, actorId);
  const r = await recordTestReceipt(db.prisma, b.id, actorId, 2147483647);
  await recordTestRefund(db.prisma, b.id, actorId, r.id, 2147483647);
  await expect(receivePayment(db.prisma, b.id, { amount: 1, method: 'cash', reference: 'overflow', occurredAt: '2026-01-01T00:00:00Z' }, 'overflow', actorId))
    .rejects.toMatchObject({ code: 'PAYMENT_LIMIT_EXCEEDED' });
  expect(await db.prisma.paymentTransaction.count({ where: { reference: 'overflow' } })).toBe(0);
  expect((await auditPayments(db.prisma)).issues).toEqual([]);
});
