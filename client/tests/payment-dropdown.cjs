const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, page, tick, nodes, button } = require('./helpers/components.cjs');

async function openPayment(pricePerNight, nights, remaining, ledgerReady = true) {
  const booking = { id: 'booking1', guestId: 'guest1', roomId: 'room1', guestCount: 2,
    checkInDate: '2026-10-14', checkOutDate: `2026-10-${14 + nights}`,
    pricePerNight, totalPrice: pricePerNight * nights, status: 'confirmed' };
  const calls = [], errors = [];
  const h = harness({ call: async url => url.startsWith('/bookings?') ? page([booking])
    : url.endsWith('/payment') ? { remaining, net: booking.totalPrice - remaining, ledgerReady }
    : url.startsWith('/guests') ? { id: 'guest1', fullName: 'Guest' } : booking,
    action: async (...args) => { calls.push(args); return false; },
    setError: error => errors.push(error), clearChoice() {}, busy: false, choice: null });
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
  const reference = () => nodes(nodes(render(), n => n.props.title === 'เลขอ้างอิงหลักฐาน')[0], n => n.type === 'input')[0];
  reference().props.onChange({ target: { value: 'RC-20261014-0001' } });
  await nodes(render(), n => n.type === 'form' && n.props.className?.split(/\s+/).includes('money-form'))[0].props.onSubmit({ preventDefault() {} });
  assert.equal(calls[0][0], '/bookings/booking1/payment/receipts');
  assert.equal(calls[0][2].amount, 276);
  assert.equal(calls[0][2].reference, 'RC-20261014-0001');
  h.unmount();
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
