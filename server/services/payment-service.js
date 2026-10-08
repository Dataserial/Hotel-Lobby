const { fail, objectId } = require('../lib/http');
const { MAX_AMOUNT, moneyInput, assertLedger, summarize } = require('./payment-ledger');
const { assertActor, operationTransaction, touchBooking } = require('./operation-transaction');

async function replay(tx, paymentId, data) {
  const existing = await tx.paymentTransaction.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (!existing) return null;
  const equal = existing.paymentId === paymentId && Object.keys(data).every((key) => {
    const left = existing[key] instanceof Date ? existing[key].toISOString() : existing[key];
    const right = data[key] instanceof Date ? data[key].toISOString() : data[key];
    return left === right;
  });
  if (!equal) fail(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with a different request');
  return { transaction: existing, replayed: true };
}

async function recordMoney(prisma, bookingId, kind, input, key, actorId, clock = () => new Date()) {
  bookingId = objectId(bookingId).toLowerCase();
  const data = moneyInput(kind, input, key, clock());
  const operation = async (tx) => {
    await assertActor(tx, actorId);
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { payment: true } });
    if (!booking) fail(404, 'BOOKING_NOT_FOUND', 'Booking does not exist');
    const previous = await replay(tx, booking.payment?.id, data);
    if (previous) return previous;
    const allowed = kind === 'receive' ? ['confirmed', 'checked_in'] : ['confirmed'];
    if (!allowed.includes(booking.status)) fail(409, 'INVALID_TRANSITION', 'Payment operation is not allowed in this booking state');
    const rows = await assertLedger(tx, booking);
    const net = booking.payment.paidAmount - booking.payment.refundedAmount;
    const cumulative = kind === 'receive' ? booking.payment.paidAmount : booking.payment.refundedAmount;
    if (cumulative + data.amount > MAX_AMOUNT) fail(409, 'PAYMENT_LIMIT_EXCEEDED', 'Cumulative amount exceeds the supported integer baht limit');
    if (kind === 'receive' && data.amount > booking.totalPrice - net) fail(409, 'PAYMENT_EXCEEDS_REMAINING', 'Receipt exceeds remaining balance');
    if (kind === 'refund') {
      const source = rows.find((row) => row.id === data.receiptId && row.kind === 'receive');
      if (!source) fail(409, 'INVALID_RECEIPT', 'Refund must reference a receipt for this booking');
      const refunded = rows.filter((row) => row.receiptId === source.id).reduce((sum, row) => sum + row.amount, 0);
      if (data.amount > net || data.amount > source.amount - refunded) fail(409, 'REFUND_EXCEEDS_RECEIPT', 'Refund exceeds net balance or source receipt');
    }
    const duplicate = await tx.paymentTransaction.findUnique({ where: {
      kind_method_reference: { kind, method: data.method, reference: data.reference },
    } });
    if (duplicate) fail(409, 'DUPLICATE_REFERENCE', 'Payment evidence already recorded');
    await touchBooking(tx, booking, actorId);
    // Preserve a total recording order, including multiple writes in one millisecond.
    const createdAt = new Date(Math.max(clock().getTime(), ...rows.map((row) => row.createdAt.getTime() + 1)));
    const transaction = await tx.paymentTransaction.create({ data: {
      ...data, paymentId: booking.payment.id, recordedById: actorId, createdAt,
    } });
    const summary = summarize(booking, [...rows, transaction]);
    await tx.payment.update({ where: { id: booking.payment.id }, data: { ...summary, recordedById: actorId } });
    return { transaction, replayed: false };
  };
  try { return await operationTransaction(prisma, operation); }
  catch (error) {
    if (error.code !== 'P2002') throw error;
    // A unique race aborts its transaction. Inspect committed winners in a new
    // transaction; never interpret unrelated unique failures as a replay.
    return operationTransaction(prisma, async (tx) => {
      await assertActor(tx, actorId);
      const payment = await tx.payment.findUnique({ where: { bookingId } });
      const previous = await replay(tx, payment?.id, data);
      if (previous) return previous;
      const duplicate = await tx.paymentTransaction.findUnique({ where: {
        kind_method_reference: { kind, method: data.method, reference: data.reference },
      } });
      if (duplicate) fail(409, 'DUPLICATE_REFERENCE', 'Payment evidence already recorded');
      throw error;
    });
  }
}

const receivePayment = (prisma, bookingId, input, key, actorId, clock) => recordMoney(prisma, bookingId, 'receive', input, key, actorId, clock);
const refundPayment = (prisma, bookingId, input, key, actorId, clock) => recordMoney(prisma, bookingId, 'refund', input, key, actorId, clock);
module.exports = { receivePayment, refundPayment };
