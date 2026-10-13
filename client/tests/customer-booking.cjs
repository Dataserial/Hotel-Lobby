const { test } = require('node:test');
const assert = require('node:assert/strict');
const { domApp } = require('./helpers/dom.cjs');
const types = [{ id: 'standard', name: 'Standard', capacity: 2, pricePerNight: 1200, amenities: ['Wi-Fi'], totalRooms: 3, availableRooms: 2 }, { id: 'family', name: 'Family', capacity: 4, pricePerNight: 2600, amenities: [], totalRooms: 1, availableRooms: 1 }];
const grid = (type = types[0]) => ({ roomType: type, items: [{ roomId: type.id + '-101', roomNumber: '101', status: 'available' }, { roomId: type.id + '-102', roomNumber: '102', status: 'maintenance' }, { roomId: type.id + '-103', roomNumber: '103', status: 'available' }] });
const customer = { id: 'customer', name: 'Test Customer', email: 'customer@example.test', role: 'customer', active: true };
async function setup(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  const h = domApp('http://localhost:5173/discover');
  const scrollCalls = [];
  h.dom.window.HTMLElement.prototype.scrollIntoView = function(options) { scrollCalls.push({ id: this.id, options }); };
  const Component = h.loadSource('PublicHotel.tsx').default;
  await h.React.act(async () => h.root.render(h.React.createElement(Component, { staff() {}, member() {}, user: customer, token: 'customer-token' })));
  const doc = h.dom.window.document;
  const submit = selector => h.React.act(async () => doc.querySelector(selector).dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true })));
  const close = async () => { await h.close(); globalThis.fetch = original; };
  return { h, doc, submit, close, scrollCalls };
}
async function choose(fixture) {
  const { h, doc, submit } = fixture;
  await submit('.availability-search'); await h.waitFor(() => h.button('เลือก Standard'));
  assert.equal(doc.querySelectorAll('.room-number').length, 0);
  await h.React.act(async () => h.button('เลือก Standard').click());
  await h.waitFor(() => doc.querySelector('.room-number'));
  await h.React.act(async () => doc.querySelector('.room-number:not(:disabled)').click());
  await h.input(doc.querySelector('input[type="tel"]'), '0812345678');
  await h.input(doc.querySelector('input[autocomplete="off"]'), 'PASSPORT-12345');
}
function publicResponse(url, price = 1200) {
  if (url.includes('/grid/types?')) { assert.ok(!url.includes('guestCount')); return Response.json({ items: types.map(type => ({ ...type, pricePerNight: type.id === 'standard' ? price : type.pricePerNight })) }); }
  return Response.json(grid({ ...types[0], pricePerNight: price }));
}

test('discover scrolls after each loaded step, supports step navigation, and respects reduced motion', async () => {
  let finishTypes, finishGrid;
  const fixture = await setup(url => {
    if (url.includes('/grid/types?')) return new Promise(resolve => { finishTypes = resolve; });
    if (url.includes('/grid?')) return new Promise(resolve => { finishGrid = resolve; });
    return Promise.resolve(Response.json({ id: 'booking-scroll', roomNumber: '101', roomType: 'Standard',
      checkInDate: '2026-10-14', checkOutDate: '2026-10-15', guestCount: 2, pricePerNight: 1200,
      totalPrice: 1200, status: 'confirmed', paymentStatus: 'pending' }));
  });
  const { h, doc, scrollCalls } = fixture;
  const step = index => doc.querySelectorAll('.booking-step-link')[index];
  const lastTarget = () => scrollCalls.at(-1)?.id;
  try {
    h.dom.window.matchMedia = () => ({ matches: false });
    assert.equal(scrollCalls.length, 0, 'first visit stays at the intro');
    assert.equal(step(1).disabled, true);
    assert.equal(step(3).disabled, true);
    await fixture.submit('.availability-search');
    assert.equal(scrollCalls.length, 0, 'wait for the type cards to load');
    await h.React.act(async () => finishTypes(Response.json({ items: types })));
    assert.equal(lastTarget(), 'booking-types-section');
    assert.equal(scrollCalls.at(-1).options.behavior, 'smooth');
    await h.React.act(async () => h.button('เลือก Standard').click());
    assert.equal(lastTarget(), 'booking-types-section', 'wait for the room grid to load');
    await h.React.act(async () => finishGrid(Response.json(grid())));
    assert.equal(lastTarget(), 'booking-room-grid');
    await h.React.act(async () => doc.querySelector('.room-number:not(:disabled)').click());
    assert.equal(lastTarget(), 'booking-confirmation');
    assert.equal(step(3).disabled, false);
    const beforeTyping = scrollCalls.length;
    await h.input(doc.querySelector('input[type="tel"]'), '0812345678');
    await h.input(doc.querySelector('input[autocomplete="off"]'), 'PASSPORT-12345');
    assert.equal(scrollCalls.length, beforeTyping, 'typing does not move the viewport');
    for (const [index, id] of [[0, 'booking-dates'], [1, 'booking-types-section'], [2, 'booking-room-grid'], [3, 'booking-confirmation']]) {
      await h.React.act(async () => step(index).click());
      assert.equal(lastTarget(), id);
    }
    h.dom.window.matchMedia = () => ({ matches: true });
    await h.React.act(async () => step(0).click());
    assert.equal(scrollCalls.at(-1).options.behavior, 'instant');
    await fixture.submit('.booking-confirm form');
    assert.equal(lastTarget(), 'booking-success');
    assert.equal(step(3).getAttribute('aria-controls'), 'booking-success');
    await h.input(doc.querySelector('input[type="date"]'), '2027-06-01');
    assert.equal(step(2).disabled, true);
    assert.equal(doc.querySelector('.booking-confirm'), null);
  } finally { await fixture.close(); }
});

test('price change refreshes the summary, preserves inputs, and requires explicit confirmation', async () => {
  let price = 1200; const posts = [];
  const fixture = await setup(async (url, options) => {
    if (!url.includes('/customer/bookings')) return publicResponse(url, price);
    posts.push({ body: JSON.parse(options.body), key: options.headers['Idempotency-Key'] });
    if (posts.length === 1) { price = 1500; return Response.json({ error: { code: 'PRICE_CHANGED', message: 'changed' } }, { status: 409 }); }
    return Response.json({ id: 'booking-1', roomNumber: '101', roomType: 'Standard', checkInDate: posts[1].body.checkInDate, checkOutDate: posts[1].body.checkOutDate, guestCount: 2, pricePerNight: price, totalPrice: price, status: 'confirmed', paymentStatus: 'pending' });
  });
  try {
    await choose(fixture); await fixture.submit('.booking-confirm form');
    await fixture.h.waitFor(() => fixture.h.button('ยืนยันราคาใหม่และจอง · ชำระที่โรงแรม'));
    assert.equal(posts.length, 1); assert.equal(fixture.doc.querySelector('input[autocomplete="off"]').value, 'PASSPORT-12345');
    assert.ok(fixture.doc.querySelector('.booking-confirm').textContent.includes('1,500'));
    assert.ok(!fixture.h.dom.window.sessionStorage.getItem('hotel-lobby-booking-draft').includes('PASSPORT'));
    await fixture.submit('.booking-confirm form'); await fixture.h.waitFor(() => fixture.doc.body.textContent.includes('จองสำเร็จ'));
    assert.equal(posts[1].body.expectedPricePerNight, 1500); assert.notEqual(posts[0].key, posts[1].key);
    assert.equal(fixture.doc.querySelector('input[autocomplete="off"]'), null);
  } finally { await fixture.close(); }
});

test('room conflict returns to grid and preserves form for another room; retries keep the key', async () => {
  const posts = []; let busyRoom = false;
  const fixture = await setup(async (url, options) => {
    if (url.includes('/grid/types?')) return publicResponse(url);
    if (!url.includes('/customer/bookings')) { const value = grid(); if (busyRoom) value.items[0].status = 'unavailable'; return Response.json(value); }
    posts.push({ body: JSON.parse(options.body), key: options.headers['Idempotency-Key'] });
    if (posts.length === 1) throw new Error('network dropped');
    busyRoom = true; return Response.json({ error: { code: 'ROOM_UNAVAILABLE', message: 'busy' } }, { status: 409 });
  });
  try {
    await choose(fixture); await fixture.submit('.booking-confirm form'); await fixture.submit('.booking-confirm form');
    await fixture.h.waitFor(() => fixture.doc.querySelectorAll('.room-number:disabled').length === 2);
    assert.equal(posts[0].key, posts[1].key); assert.equal(fixture.doc.querySelector('.booking-confirm'), null);
    await fixture.h.React.act(async () => fixture.doc.querySelector('.room-number:not(:disabled)').click());
    assert.equal(fixture.doc.querySelector('input[type="tel"]').value, '0812345678');
    assert.equal(fixture.doc.querySelector('input[autocomplete="off"]').value, 'PASSPORT-12345');
    await fixture.h.input(fixture.doc.querySelector('input[type="date"]'), '2027-05-01');
    assert.equal(fixture.doc.querySelector('.booking-confirm'), null); assert.equal(fixture.doc.querySelectorAll('.room-number').length, 0);
    assert.equal(fixture.h.dom.window.sessionStorage.getItem('hotel-lobby-booking-draft'), null);
  } finally { await fixture.close(); }
});

test('late type and room responses are aborted and cannot revive cleared selections; loading retries work', async () => {
  let finishTypes, finishGrid; let typesCalls = 0;
  const fixture = await setup((url) => {
    if (url.includes('/grid/types?')) {
      typesCalls++;
      if (typesCalls === 1) return new Promise(resolve => { finishTypes = resolve; });
      if (typesCalls === 2) return Promise.resolve(Response.json({ error: { message: 'failed' } }, { status: 503 }));
      return Promise.resolve(Response.json({ items: types }));
    }
    return new Promise(resolve => { finishGrid = resolve; });
  });
  try {
    await fixture.submit('.availability-search');
    await fixture.h.input(fixture.doc.querySelector('input[type="date"]'), '2027-06-01');
    await fixture.h.React.act(async () => finishTypes(Response.json({ items: types })));
    assert.equal(fixture.doc.querySelectorAll('.room-type-card').length, 0);
    await fixture.submit('.availability-search'); await fixture.h.waitFor(() => fixture.h.button('ลองอีกครั้ง'));
    await fixture.h.React.act(async () => fixture.h.button('ลองอีกครั้ง').click()); await fixture.h.waitFor(() => fixture.h.button('เลือก Standard'));
    await fixture.h.React.act(async () => fixture.h.button('เลือก Standard').click());
    const standardFinish = finishGrid;
    await fixture.h.React.act(async () => fixture.h.button('เลือก Family').click());
    const familyFinish = finishGrid;
    await fixture.h.React.act(async () => familyFinish(Response.json(grid(types[1]))));
    await fixture.h.React.act(async () => standardFinish(Response.json(grid())));
    assert.ok(fixture.doc.querySelector('#room-grid-title').textContent.includes('Family'));
    await fixture.h.React.act(async () => fixture.h.button('เลือก Standard').click());
    const lateFinish = finishGrid;
    await fixture.h.input(fixture.doc.querySelector('input[type="date"]'), '2027-07-01');
    await fixture.h.React.act(async () => lateFinish(Response.json(grid())));
    assert.equal(fixture.doc.querySelectorAll('.room-number').length, 0);
    await fixture.h.input(fixture.doc.querySelector('input[type="date"]'), '');
    await fixture.submit('.availability-search'); assert.ok(fixture.doc.querySelector('[role="alert"]'));
  } finally { await fixture.close(); }
});

test('full anonymous selection, signup, booking, account and staff visibility on isolated replica set', { timeout: 180000 }, async () => {
  const { startDatabase } = require('../../server/tests/task3-db'); const { createApp } = require('../../server/app');
  const db = await startDatabase('hotel_lobby_task5_test'); let server, h;
  try {
    const type = await db.prisma.roomType.create({ data: { name: 'Family', nameKey: 'family', capacity: 4, basePrice: 2600, amenities: [] } });
    await db.prisma.room.create({ data: { number: '301', roomTypeId: type.id, active: true } });
    server = createApp(db.prisma).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port + '/api';
    h = domApp('http://localhost:5173/discover', { VITE_API_BASE_URL: base });
    const App = h.loadSource('App.tsx').default; await h.React.act(async () => h.root.render(h.React.createElement(App)));
    const doc = h.dom.window.document;
    const submit = selector => h.React.act(async () => doc.querySelector(selector).dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true })));
    await submit('.availability-search'); await h.waitFor(() => h.button('เลือก Family'));
    await h.React.act(async () => h.button('เลือก Family').click()); await h.waitFor(() => doc.querySelector('.room-number'));
    await h.React.act(async () => doc.querySelector('.room-number').click());
    const saved = JSON.parse(h.dom.window.sessionStorage.getItem('hotel-lobby-booking-draft'));
    assert.deepEqual(Object.keys(saved).sort(), ['checkInDate', 'checkOutDate', 'roomId', 'roomTypeId']);
    await h.React.act(async () => h.button('เข้าสู่ระบบหรือสมัครสมาชิกเพื่อจอง').click());
    await h.React.act(async () => h.button('ยังไม่มีบัญชี? สมัครสมาชิก').click());
    await h.input(doc.querySelector('input[autocomplete="name"]'), 'Flow Customer'); await h.input(doc.querySelector('input[type="email"]'), 'flow@example.test');
    for (const input of doc.querySelectorAll('input[type="password"]')) await h.input(input, 'flow-password-123');
    await submit('.login-card'); await h.waitFor(() => doc.querySelector('.booking-confirm form'));
    assert.ok(doc.querySelector('.booking-confirm').textContent.includes('301'));
    await h.input(doc.querySelector('input[type="tel"]'), '0812345678'); await h.input(doc.querySelector('input[autocomplete="off"]'), 'FLOW-PASSPORT-123');
    await submit('.booking-confirm form'); await h.waitFor(() => h.button('ดูการจองของฉัน'));
    const booking = await db.prisma.booking.findFirst(); assert.equal(booking.guestCount, 4); assert.equal(booking.status, 'confirmed');
    assert.equal(await db.prisma.roomNightClaim.count({ where: { bookingId: booking.id } }), 1);
    assert.equal((await db.prisma.payment.findUnique({ where: { bookingId: booking.id } })).status, 'pending');
    await h.React.act(async () => h.button('ดูการจองของฉัน').click()); await h.waitFor(() => doc.querySelector('.my-bookings'));
    assert.ok(doc.querySelector('.my-bookings').textContent.includes(booking.id));
    assert.ok(doc.body.textContent.includes('ติดต่อพนักงาน'));
    const bcrypt = require('../../server/node_modules/bcryptjs');
    await db.prisma.user.create({ data: { name: 'Flow Staff', email: 'flow-staff@example.test', role: 'receptionist', passwordHash: await bcrypt.hash('flow-staff-password-123', 4) } });
    const staffLogin = await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'flow-staff@example.test', password: 'flow-staff-password-123' }) })).json();
    const staffRows = await (await fetch(base + '/bookings', { headers: { Authorization: 'Bearer ' + staffLogin.token } })).json();
    assert.ok(staffRows.items.some(row => row.id === booking.id));
    await h.openAccount(); await h.React.act(async () => h.button('ออกจากระบบ').click());
    await h.React.act(async () => h.loadSource('navigation.ts').navigate('/discover'));
    await h.input(doc.querySelector('input[type="date"]'), '2027-04-01');
    await h.input(doc.querySelectorAll('input[type="date"]')[1], '2027-04-03');
    await submit('.availability-search'); await h.waitFor(() => h.button('เลือก Family'));
    await h.React.act(async () => h.button('เลือก Family').click()); await h.waitFor(() => doc.querySelector('.room-number'));
    await h.React.act(async () => doc.querySelector('.room-number').click());
    await h.React.act(async () => h.button('เข้าสู่ระบบหรือสมัครสมาชิกเพื่อจอง').click());
    await h.input(doc.querySelector('input[type="email"]'), 'flow@example.test');
    await h.input(doc.querySelector('input[type="password"]'), 'flow-password-123');
    await submit('.login-card'); await h.waitFor(() => doc.querySelector('.booking-confirm form'));
    assert.ok(doc.querySelector('.booking-confirm').textContent.includes('2027-04-01'));
    assert.ok(doc.querySelector('.booking-confirm').textContent.includes('301'));
    assert.equal(doc.querySelector('input[autocomplete="off"]').value, '');
  } finally { if (h) await h.close(); if (server) await new Promise(resolve => server.close(resolve)); await db.stop(); }
});

test('confirmation ignores a second submit while the first is running', async () => {
  let finish, count = 0;
  const fixture = await setup((url) => {
    if (!url.includes('/customer/bookings')) return Promise.resolve(publicResponse(url));
    count++; return new Promise(resolve => { finish = resolve; });
  });
  try {
    await choose(fixture);
    await fixture.h.React.act(async () => {
      const event = () => new fixture.h.dom.window.Event('submit', { bubbles: true, cancelable: true });
      fixture.doc.querySelector('.booking-confirm form').dispatchEvent(event());
      fixture.doc.querySelector('.booking-confirm form').dispatchEvent(event());
    });
    assert.equal(count, 1); assert.equal(fixture.doc.querySelector('input[type="tel"]').disabled, true);
    await fixture.h.React.act(async () => finish(Response.json({ error: { code: 'DOCUMENT_REVIEW_REQUIRED', message: 'verify' } }, { status: 409 })));
    assert.equal(fixture.doc.querySelector('input[autocomplete="off"]').value, 'PASSPORT-12345');
    assert.ok(fixture.doc.body.textContent.includes('ติดต่อพนักงาน'));
  } finally { await fixture.close(); }
});

test('member bookings show loading and failure separately, retry, and expose pagination', async () => {
  const h = domApp(); let calls = 0;
  const Component = h.loadSource('MemberAccount.tsx').default;
  const booking = { id: 'booking-1', roomNumber: '101', roomType: 'Standard', checkInDate: '2027-01-01', checkOutDate: '2027-01-02', guestCount: 2, pricePerNight: 1200, totalPrice: 1200, status: 'confirmed', paymentStatus: 'pending' };
  const call = async path => {
    calls++;
    if (calls === 1) throw new Error('failed to load');
    return { items: [{ ...booking, id: path.includes('page=2') ? 'booking-2' : 'booking-1' }], page: path.includes('page=2') ? 2 : 1, limit: 1, total: 2 };
  };
  try {
    await h.React.act(async () => h.root.render(h.React.createElement(Component, { user: customer, call, updated() {}, logout() {}, back() {} })));
    assert.ok(h.button('ลองอีกครั้ง')); assert.ok(!h.dom.window.document.body.textContent.includes('ยังไม่มีการจอง'));
    await h.React.act(async () => h.button('ลองอีกครั้ง').click()); await h.waitFor(() => h.dom.window.document.querySelector('.my-bookings'));
    assert.ok(h.dom.window.document.querySelector('.my-bookings').textContent.includes('booking-1'));
    await h.React.act(async () => h.button('หน้าถัดไป').click()); await h.waitFor(() => h.dom.window.document.body.textContent.includes('booking-2'));
    assert.equal(h.button('หน้าถัดไป').disabled, true);
  } finally { await h.close(); }
});
