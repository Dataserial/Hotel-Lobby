const { fail, objectId } = require('../lib/http');
const { moneyInput, summarize, assertSummary, ledgerRows } = require('./payment-ledger');
const { assertActor, operationTransaction, touchBooking } = require('./operation-transaction');

async function auditPayments(prisma) {
  const issues = [];
  const bookings = await prisma.booking.findMany({ include: { payment: true } });
  const payments = await prisma.payment.findMany();
  const transactions = await prisma.paymentTransaction.findMany();
  const bookingIds = new Set(bookings.map((b) => b.id));
  const paymentIds = new Set(payments.map((p) => p.id));
  for (const p of payments) if (!bookingIds.has(p.bookingId)) issues.push({ paymentId: p.id, code: 'ORPHAN_PAYMENT' });
  for (const row of transactions) {
    if (!paymentIds.has(row.paymentId)) issues.push({ transactionId: row.id, code: 'ORPHAN_TRANSACTION' });
    if (!await prisma.user.findUnique({ where: { id: row.recordedById } })) issues.push({ transactionId: row.id, code: 'ORPHAN_ACTOR' });
  }
  for (const booking of bookings) {
    if (!booking.payment && booking.status === 'cancelled') continue;
    try {
      if (!booking.payment) fail(409, 'PAYMENT_MISSING', 'Missing summary');
      assertSummary(booking.payment, summarize(booking, await ledgerRows(prisma, booking.payment.id)));
      if (!booking.payment.ledgerReady) fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Readiness not verified');
    } catch (error) {
      if (!error.status) throw error;
      issues.push({ bookingId: booking.id, code: error.code });
    }
  }
  return { bookings: bookings.length, payments: payments.length, transactions: transactions.length, issues };
}

function sameRecord(row, expected) {
  return Object.keys(expected).every((key) => {
    const a = row[key] instanceof Date ? row[key].toISOString() : row[key];
    const b = expected[key] instanceof Date ? expected[key].toISOString() : expected[key];
    return a === b;
  });
}

// Evidence is supplied by an operator after verifying real vouchers. Totals alone
// are intentionally insufficient. Each file represents one complete booking ledger.
async function reconcilePayment(prisma, evidence, actorId) {
  if (!evidence || evidence.verified !== true || !Array.isArray(evidence.transactions)) {
    fail(400, 'VALIDATION_ERROR', 'Verified evidence and complete transactions required');
  }
  const bookingId = objectId(evidence.bookingId).toLowerCase();
  const normalized = evidence.transactions.map((row) => {
    const { id, recordedById, kind, idempotencyKey, ...input } = row;
    return { id: objectId(id).toLowerCase(), recordedById: objectId(recordedById).toLowerCase(), ...moneyInput(kind, input, idempotencyKey) };
  });
  if (new Set(normalized.map((r) => r.id)).size !== normalized.length) fail(400, 'VALIDATION_ERROR', 'Duplicate transaction IDs');
  return operationTransaction(prisma, async (tx) => {
    await assertActor(tx, actorId);
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { payment: true } });
    if (!booking?.payment) fail(404, 'PAYMENT_NOT_FOUND', 'Booking payment not found');
    const existing = await ledgerRows(tx, booking.payment.id);
    if (existing.some((row) => !normalized.some((item) => item.id === row.id))) fail(409, 'PAYMENT_INCONSISTENT', 'Evidence must include all existing transactions');
    let importedAt = Math.max(Date.now(), ...existing.map((row) => row.createdAt.getTime() + 1));
    for (const row of normalized) {
      if (!await tx.user.findUnique({ where: { id: row.recordedById } })) fail(409, 'INVALID_REFERENCE', 'Evidence actor does not exist');
      const data = { ...row, paymentId: booking.payment.id };
      const current = existing.find((item) => item.id === row.id);
      if (current) {
        if (!sameRecord(current, data)) fail(409, 'PAYMENT_INCONSISTENT', 'Evidence differs from immutable ledger');
      } else {
        if (booking.payment.ledgerReady) fail(409, 'PAYMENT_INCONSISTENT', 'A ready ledger cannot be extended by reconciliation');
        // Preserve verified file ordering for latest-recorded metadata. createdAt
        // is import time; occurredAt alone represents the historical event.
        await tx.paymentTransaction.create({ data: { ...data, createdAt: new Date(importedAt++) } });
      }
    }
    const rows = await ledgerRows(tx, booking.payment.id);
    const summary = summarize(booking, rows);
    // Legacy latest-channel/timestamp/status metadata may be stale, but totals
    // must match exactly; only derived metadata is repaired from real evidence.
    for (const key of ['amount', 'paidAmount', 'refundedAmount']) {
      if (booking.payment[key] !== summary[key]) fail(409, 'PAYMENT_INCONSISTENT', 'Evidence totals do not match existing summary');
    }
    if (booking.payment.ledgerReady) { assertSummary(booking.payment, summary); return booking.payment; }
    await touchBooking(tx, booking, actorId);
    return tx.payment.update({ where: { id: booking.payment.id }, data: { ...summary, ledgerReady: true } });
  });
}

module.exports = { auditPayments, reconcilePayment, sameRecord };
