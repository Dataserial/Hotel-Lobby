const { moneyInput, summarize, paymentStatus } = require('../services/payment-ledger');

test('cumulative receipts may exceed current price after refunds', () => {
  const result = summarize({ totalPrice: 50, status: 'confirmed' }, [
    { id: 'a', kind: 'receive', amount: 100, method: 'cash', reference: 'a', occurredAt: new Date(0) },
    { id: 'b', kind: 'refund', receiptId: 'a', reason: 'reprice', amount: 100, method: 'cash', reference: 'b', occurredAt: new Date(1) },
    { id: 'c', kind: 'receive', amount: 50, method: 'card', reference: 'c', occurredAt: new Date(2) },
  ]);
  expect(result).toMatchObject({ amount: 50, paidAmount: 150, refundedAmount: 100, status: 'paid', method: 'card' });
});
test('cancel without money is not refunded and zero price is paid', () => {
  expect(paymentStatus('cancelled', 100, 0, 0)).toBe('pending');
  expect(paymentStatus('confirmed', 0, 0, 0)).toBe('paid');
  expect(paymentStatus('cancelled', 100, 50, 50)).toBe('refunded');
});
test.each([0, -1, 0.5, 2147483648, '10'])('invalid amount %s', (amount) => {
  expect(() => moneyInput('receive', { amount, method: 'cash', reference: 'voucher', occurredAt: '2026-01-01T00:00:00Z' }, 'key')).toThrow();
});
test.each(['2026-02-30T00:00:00Z', '2026-01-01', '2999-01-01T00:00:00Z'])('reject invalid/future date %s', (occurredAt) => {
  expect(() => moneyInput('receive', { amount: 1, method: 'cash', reference: 'v', occurredAt }, 'key')).toThrow();
});
