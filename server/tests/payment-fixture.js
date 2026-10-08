const { receivePayment, refundPayment } = require('../services/payment-service');
async function recordTestReceipt(prisma, bookingId, actorId, amount = 100) {
  const input = { amount, method: 'cash', reference: `TEST-RECEIPT-${bookingId}`, occurredAt: '2026-01-01T00:00:00Z' };
  return (await receivePayment(prisma, bookingId, input, `test-receive-${bookingId}`, actorId)).transaction;
}
async function recordTestRefund(prisma, bookingId, actorId, receiptId, amount = 100) {
  const input = { amount, method: 'cash', reference: `TEST-REFUND-${bookingId}`, occurredAt: '2026-01-01T00:00:00Z', receiptId, reason: 'Synthetic test refund' };
  return (await refundPayment(prisma, bookingId, input, `test-refund-${bookingId}`, actorId)).transaction;
}
module.exports = { recordTestReceipt, recordTestRefund };
