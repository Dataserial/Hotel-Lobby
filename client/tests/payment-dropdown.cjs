const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, page, tick, nodes, button, deferred } = require('./helpers/components.cjs');
const { moneyInput } = require('../../server/services/payment-ledger');

async function openPayment(pricePerNight, nights, remaining, ledgerReady = true, api = {}) {
  const booking = { id: 'booking1', guestId: 'guest1', roomId: 'room1', guestCount: 2,
    checkInDate: '2026-10-14', checkOutDate: `2026-10-${14 + nights}`,
    pricePerNight, totalPrice: pricePerNight * nights, status: 'confirmed' };
  const calls = [], errors = [];
  const h = harness({ call: async url => url.startsWith('/bookings?') ? page([booking])
    : url.endsWith('/payment') ? { remaining, net: booking.totalPrice - remaining, ledgerReady }
    : url.startsWith('/guests') ? { id: 'guest1', fullName: 'Guest' } : booking,
    action: async (...args) => { calls.push(args); return false; },
    setError: error => errors.push(error), clearChoice() {}, busy: false, choice: null }, api);
  h.render('BookingsView'); await h.flush();
  button(h.render('BookingsView'), 'รายละเอียด').props.onClick(); await tick();
  button(h.render('BookingsView'), 'รับเงิน').props.onClick();
  const render = () => h.render('BookingsView');
  const amount = () => nodes(nodes(render(), n => n.props.title === 'จำนวนเงิน (บาท)')[0], n => n.type === 'select')[0];
  return { h, render, amount, calls, errors };
}

test('receipt dropdown uses the booked nightly price and offers the complete balance', async () => {
  for (const price of [1200, 1800, 2600]) {
    const { h, amount } = await openPayment(price, 3, price * 3);
    const options = nodes(amount(), n => n.type === 'option' && Number.isInteger(n.props.value));
    assert.deepEqual(options.map(n => n.props.value), [price * 3, price, price * 2]);
    assert.ok(options[1].props.children[0].includes('1 คืน'));
    h.unmount();
  }
});

test('partial receipt offers the exact 276-baht balance and submits it as a number', async () => {
  const { h, render, amount, calls } = await openPayment(2600, 1, 276);
  assert.deepEqual(nodes(amount(), n => n.type === 'option' && Number.isInteger(n.props.value)).map(n => n.props.value), [276]);
  amount().props.onChange({ target: { value: '276' } });
  assert.equal(nodes(render(), n => n.props.title === 'เลขอ้างอิงหลักฐาน').length, 0);
  await nodes(render(), n => n.type === 'form' && n.props.className?.split(/\s+/).includes('money-form'))[0].props.onSubmit({ preventDefault() {} });
  assert.equal(calls[0][0], '/bookings/booking1/payment/receipts');
  assert.equal(calls[0][2].amount, 276);
  const firstKey = calls[0][3];
  assert.ok(firstKey);
  assert.equal(calls[0][2].reference, `AUTO-RC-${firstKey}`);
  await nodes(render(), n => n.type === 'form' && n.props.className?.split(/\s+/).includes('money-form'))[0].props.onSubmit({ preventDefault() {} });
  assert.equal(calls[1][3], firstKey);
  assert.deepEqual(calls[1][2], calls[0][2]);
  h.unmount();
});

test('automatic receipt references meet the legacy API contract for every payment method', async () => {
  for (const method of ['cash', 'bank_transfer', 'card']) {
    const { h, render, amount, calls } = await openPayment(1200, 1, 1200);
    amount().props.onChange({ target: { value: '1200' } });
    const methodField = nodes(render(), n => n.props.title === 'วิธีชำระ')[0];
    nodes(methodField, n => n.type === 'select')[0].props.onChange({ target: { value: method } });
    assert.equal(nodes(render(), n => n.props.title === 'เลขอ้างอิงหลักฐาน').length, 0);
    const submit = () => nodes(render(), n => n.type === 'form' && n.props.className?.split(/\s+/).includes('money-form'))[0].props.onSubmit({ preventDefault() {} });
    await submit();
    const payload = calls[0][2];
    assert.deepEqual(Object.keys(payload).sort(), ['amount', 'method', 'reference', 'occurredAt'].sort());
    assert.equal(payload.method, method);
    assert.equal(payload.reference, `AUTO-RC-${calls[0][3]}`);
    assert.ok(payload.reference.trim().length > 0 && payload.reference.length <= 128);
    assert.ok(Number.isFinite(Date.parse(payload.occurredAt)));
    await submit();
    assert.deepEqual(calls[1], calls[0]);
    h.unmount();
  }
});

test('settled balances and unverified ledgers cannot submit a receipt', async () => {
  for (const [remaining, ledgerReady] of [[0, true], [1200, false]]) {
    const { h, render, amount, calls } = await openPayment(1200, 1, remaining, ledgerReady);
    assert.equal(amount().props.disabled, true);
    assert.equal(button(render(), 'บันทึกรับเงิน')?.props.disabled ?? nodes(render(), n => n.type === 'button' && n.props.children[0] === 'บันทึก')[0].props.disabled, true);
    await nodes(render(), n => n.type === 'form' && n.props.className?.split(/\s+/).includes('money-form'))[0].props.onSubmit({ preventDefault() {} });
    assert.equal(calls.length, 0);
    h.unmount();
  }
});

test('an amount outside the current balance options is rejected before calling the API', async () => {
  const { h, render, amount, calls, errors } = await openPayment(2600, 1, 276);
  amount().props.onChange({ target: { value: '2600' } });
  await nodes(render(), n => n.type === 'form' && n.props.className?.split(/\s+/).includes('money-form'))[0].props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  assert.ok(errors[0].includes('ยอดคงเหลือ'));
  h.unmount();
});

test('a custom partial receipt preserves presets and rejects an amount above the remaining balance', async () => {
  const { h, render, amount, calls, errors } = await openPayment(1200, 1, 1200);
  amount().props.onChange({ target: { value: 'custom' } });
  const customInput = () => nodes(render(), n => n.type === 'input' && n.props['aria-label'] === 'ระบุยอดรับจริง')[0];
  customInput().props.onChange({ target: { value: '300' } });
  const form = () => nodes(render(), n => n.type === 'form' && n.props.className?.split(/\s+/).includes('money-form'))[0];
  await form().props.onSubmit({ preventDefault() {} });
  assert.equal(calls[0][2].amount, 300);
  customInput().props.onChange({ target: { value: '1201' } });
  await form().props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.ok(errors.at(-1).includes('ยอดคงเหลือ'));
  h.unmount();
});

test('preset and custom amounts pass real API validation even when the device clock is ahead', async () => {
  const serverNow = new Date('2026-10-15T07:35:19.000Z');
  const deviceAhead = new Date(serverNow.getTime() + 9000).toISOString();
  assert.throws(() => moneyInput('receive', { amount: 2600, method: 'cash', reference: 'clock-repro', occurredAt: deviceAhead }, 'clock-repro', serverNow), /not in the future/);
  for (const price of [1200, 1800, 2600]) for (const mode of ['preset', 'custom']) for (const method of ['cash', 'bank_transfer', 'card']) {
    let clockReads = 0;
    const { h, render, amount, calls } = await openPayment(price, 1, price, true, {
      paymentOccurredAt: async () => { clockReads++; return serverNow.toISOString(); },
    });
    amount().props.onChange({ target: { value: mode === 'preset' ? String(price) : 'custom' } });
    if (mode === 'custom') nodes(render(), n => n.props['aria-label'] === 'ระบุยอดรับจริง')[0].props.onChange({ target: { value: String(price) } });
    nodes(nodes(render(), n => n.props.title === 'วิธีชำระ')[0], n => n.type === 'select')[0].props.onChange({ target: { value: method } });
    const submit = () => nodes(render(), n => n.type === 'form' && n.props.className?.split(/\s+/).includes('money-form'))[0].props.onSubmit({ preventDefault() {} });
    await submit();
    assert.equal(calls.length, 1);
    const parsed = moneyInput('receive', calls[0][2], calls[0][3], serverNow);
    assert.equal(parsed.amount, price);
    assert.equal(parsed.occurredAt.toISOString(), serverNow.toISOString());
    await submit();
    assert.deepEqual(calls[1], calls[0]);
    assert.equal(clockReads, 1, 'retries preserve timestamp and request identity');
    h.unmount();
  }
});

test('clock lookup failure sends no receipt and permits a retry', async () => {
  let failClock = true;
  const { h, render, amount, calls, errors } = await openPayment(2600, 1, 2600, true, {
    paymentOccurredAt: async () => { if (failClock) throw new Error('Server clock unavailable'); return '2026-10-15T07:35:19.000Z'; },
  });
  amount().props.onChange({ target: { value: '2600' } });
  const submit = () => nodes(render(), n => n.type === 'form' && n.props.className?.split(/\s+/).includes('money-form'))[0].props.onSubmit({ preventDefault() {} });
  await submit();
  assert.equal(calls.length, 0);
  assert.equal(errors[0], 'Server clock unavailable');
  failClock = false;
  await submit();
  assert.equal(calls.length, 1);
  h.unmount();
});

test('double submission while obtaining server time records only one receipt', async () => {
  const clock = deferred();
  const { h, render, amount, calls } = await openPayment(2600, 1, 2600, true, { paymentOccurredAt: () => clock.promise });
  amount().props.onChange({ target: { value: '2600' } });
  const submit = () => nodes(render(), n => n.type === 'form' && n.props.className?.split(/\s+/).includes('money-form'))[0].props.onSubmit({ preventDefault() {} });
  const first = submit();
  await submit();
  assert.equal(calls.length, 0);
  clock.resolve('2026-10-15T07:35:19.000Z');
  await first;
  assert.equal(calls.length, 1);
  h.unmount();
});
