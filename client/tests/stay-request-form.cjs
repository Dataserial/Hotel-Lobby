const { test } = require('node:test');
const assert = require('node:assert/strict');
const { domApp } = require('./helpers/dom.cjs');

const member = { id: 'member-1', name: 'Test Member', email: 'member@example.test', role: 'customer', active: true };
const service = { id: 'service-1', name: 'กาแฟ', unit: 'per_stay', price: 50, included: false, extraBed: false, roomTypeIds: [], maxQuantity: 1, active: true };
const stay = { checkInDate: '2027-02-01', checkOutDate: '2027-02-02', guestCount: 1 };
const roomType = { id: 'type-1', name: 'Standard', capacity: 2, pricePerNight: 1200 };

test('stay request sends the member token and reuses its idempotency key when retried', async () => {
  const originalFetch = globalThis.fetch;
  const h = domApp();
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/public/additional-services')) return Response.json({ items: [service], total: 1, page: 1, limit: 100 });
    if (String(url).endsWith('/stay-requests')) {
      requests.push(options);
      if (requests.length === 1) return Response.json({ error: { code: 'RATE_LIMITED', message: 'Please retry' } }, { status: 503 });
      return Response.json({ id: 'request-1' }, { status: 201 });
    }
    throw new Error('Unexpected URL ' + url);
  };
  try {
    const Form = h.loadSource('StayRequestForm.tsx').default;
    await h.React.act(async () => h.root.render(h.React.createElement(Form, { stay, roomType, user: member, token: 'member-token', login() {}, reauthenticate() {} })));
    const doc = h.dom.window.document;
    await h.waitFor(() => doc.querySelector('.service-option'));
    await h.React.act(async () => doc.querySelector('.service-option input').click());
    await h.React.act(async () => h.button('ส่งคำขอเข้าพัก').click());
    await h.input(doc.querySelector('.confirm-request input'), 'Test Member');
    await h.input(doc.querySelectorAll('.confirm-request input')[1], '0812345678');
    await h.React.act(async () => h.button('ยืนยันส่งคำขอเข้าพัก').click());
    await h.waitFor(() => h.button('ลองส่งอีกครั้ง'));
    await h.React.act(async () => h.button('ลองส่งอีกครั้ง').click());
    await h.waitFor(() => doc.querySelector('[role="status"]')?.textContent.includes('ส่งคำขอแล้ว'));
    assert.equal(requests.length, 2);
    assert.equal(requests[0].headers.Authorization, 'Bearer member-token');
    assert.equal(requests[1].headers.Authorization, 'Bearer member-token');
    assert.equal(JSON.parse(requests[0].body).clientRequestId, JSON.parse(requests[1].body).clientRequestId);
    assert.deepEqual(JSON.parse(requests[1].body).services, [{ serviceId: 'service-1', quantity: 1 }]);
  } finally { await h.close(); globalThis.fetch = originalFetch; }
});

test('expired stay-request session offers member login instead of retrying the stale token', async () => {
  const originalFetch = globalThis.fetch;
  const h = domApp();
  let reauthenticated = 0;
  globalThis.fetch = async url => {
    if (String(url).includes('/public/additional-services')) return Response.json({ items: [service], total: 1, page: 1, limit: 100 });
    if (String(url).endsWith('/stay-requests')) return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Session expired' } }, { status: 401 });
    throw new Error('Unexpected URL ' + url);
  };
  try {
    const Form = h.loadSource('StayRequestForm.tsx').default;
    await h.React.act(async () => h.root.render(h.React.createElement(Form, { stay, roomType, user: member, token: 'expired-token', login() {}, reauthenticate() { reauthenticated++; } })));
    const doc = h.dom.window.document;
    await h.waitFor(() => doc.querySelector('.service-option'));
    await h.React.act(async () => h.button('ส่งคำขอเข้าพัก').click());
    await h.input(doc.querySelector('.confirm-request input'), 'Test Member');
    await h.input(doc.querySelectorAll('.confirm-request input')[1], '0812345678');
    await h.React.act(async () => h.button('ยืนยันส่งคำขอเข้าพัก').click());
    await h.waitFor(() => h.button('เข้าสู่ระบบอีกครั้ง'));
    await h.React.act(async () => h.button('เข้าสู่ระบบอีกครั้ง').click());
    assert.equal(reauthenticated, 1);
    assert.ok(doc.querySelector('.notice.error').textContent.includes('เซสชันหมดอายุ'));
  } finally { await h.close(); globalThis.fetch = originalFetch; }
});
