const { fail, int, str, objectId } = require('../lib/http');
const MAX_AMOUNT = 2147483647;

function paymentStatus(bookingStatus, amount, paid, refunded) {
  if (bookingStatus === 'cancelled' && paid > 0 && paid === refunded) return 'refunded';
  return paid - refunded === amount ? 'paid' : 'pending';
}

function moneyInput(kind, input, key, now = new Date()) {
  const fields = ['amount', 'method', 'reference', 'occurredAt', ...(kind === 'refund' ? ['receiptId', 'reason'] : [])];
  if (!['receive', 'refund'].includes(kind) || !input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((k) => !fields.includes(k)) || fields.some((k) => input[k] == null)) {
    fail(400, 'VALIDATION_ERROR', 'Unexpected or missing payment fields');
  }
  if (typeof key !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(key)) fail(400, 'VALIDATION_ERROR', 'Idempotency-Key required');
  if (!['cash', 'bank_transfer', 'card'].includes(input.method)) fail(400, 'VALIDATION_ERROR', 'Invalid payment method');
  const occurredAt = new Date(input.occurredAt);
  if (typeof input.occurredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(input.occurredAt) ||
      !Number.isFinite(occurredAt.getTime()) || occurredAt.toISOString() !== input.occurredAt.replace(/(?<=:\d{2})Z$/, '.000Z') || occurredAt > now) {
    fail(400, 'VALIDATION_ERROR', 'occurredAt must be a valid UTC timestamp not in the future');
  }
  return {
    kind, amount: int(input.amount, 'amount', 1, MAX_AMOUNT), method: input.method,
    reference: str(input.reference, 'reference', 128), occurredAt, idempotencyKey: key,
    receiptId: kind === 'refund' ? objectId(input.receiptId, 'receiptId').toLowerCase() : null,
    reason: kind === 'refund' ? str(input.reason, 'reason', 500) : null,
  };
}

function summarize(booking, rows) {
  let paidAmount = 0, refundedAmount = 0, latestReceipt = null, latestRefund = null;
  const receipts = new Map(), refunds = new Map();
  const invalid = () => fail(409, 'PAYMENT_INCONSISTENT', 'Payment ledger or summary is inconsistent');
  if (!Number.isInteger(booking.totalPrice) || booking.totalPrice < 0 || booking.totalPrice > MAX_AMOUNT) invalid();
  for (const row of rows) {
    if (!Number.isInteger(row.amount) || row.amount <= 0 || row.amount > MAX_AMOUNT) invalid();
    if (!['cash', 'bank_transfer', 'card'].includes(row.method) ||
        typeof row.reference !== 'string' || !row.reference.trim() || row.reference.length > 128 ||
        !(row.occurredAt instanceof Date) || !Number.isFinite(row.occurredAt.getTime())) invalid();
    if (row.kind === 'receive') {
      if (row.receiptId || row.reason) invalid();
      paidAmount += row.amount;
      receipts.set(row.id, row);
      latestReceipt = row;
    } else if (row.kind === 'refund') {
      if (!row.receiptId || !row.reason) invalid();
      refundedAmount += row.amount;
      refunds.set(row.receiptId, (refunds.get(row.receiptId) || 0) + row.amount);
      latestRefund = row;
    } else invalid();
  }
  for (const [id, amount] of refunds) if (!receipts.has(id) || amount > receipts.get(id).amount) invalid();
  const net = paidAmount - refundedAmount;
  if (paidAmount > MAX_AMOUNT || refundedAmount > MAX_AMOUNT || net < 0 || net > booking.totalPrice ||
      (booking.status === 'cancelled' && net !== 0) || (booking.status === 'checked_out' && net !== booking.totalPrice)) invalid();
  return {
    amount: booking.totalPrice, paidAmount, refundedAmount,
    status: paymentStatus(booking.status, booking.totalPrice, paidAmount, refundedAmount),
    method: latestReceipt?.method || null, paidAt: latestReceipt?.occurredAt || null,
    refundedAt: latestRefund?.occurredAt || null,
  };
}

async function ledgerRows(tx, paymentId) {
  return tx.paymentTransaction.findMany({ where: { paymentId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

function assertSummary(payment, summary) {
  for (const key of Object.keys(summary)) {
    const left = payment[key] instanceof Date ? payment[key].toISOString() : payment[key];
    const right = summary[key] instanceof Date ? summary[key].toISOString() : summary[key];
    if (left !== right) fail(409, 'PAYMENT_INCONSISTENT', 'Payment summary does not match its ledger');
  }
}

async function assertLedger(tx, booking) {
  const payment = booking.payment;
  if (!payment?.ledgerReady) fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Reconcile verified payment evidence before this operation');
  const rows = await ledgerRows(tx, payment.id);
  assertSummary(payment, summarize(booking, rows));
  return rows;
}

module.exports = { MAX_AMOUNT, moneyInput, paymentStatus, summarize, ledgerRows, assertSummary, assertLedger };
