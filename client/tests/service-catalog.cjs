const { test } = require('node:test');
const assert = require('node:assert/strict');
const { domApp } = require('./helpers/dom.cjs');

test('public service catalog reaches later pages and respects included pricing and extra-bed compatibility', async () => {
  const originalFetch = globalThis.fetch, h = domApp();
  const calls = [];
  const base = { unit: 'per_stay', price: 300, included: false, extraBed: false, active: true, roomTypeIds: ['type'], maxQuantity: 1 };
  const first = Array.from({ length: 100 }, (_, index) => ({ ...base, id: 'service-' + index, name: 'Service ' + index }));
  first[0] = { ...first[0], name: 'Extra bed', extraBed: true };
  first[1] = { ...first[1], name: 'Included breakfast', included: true };
  first[2] = { ...first[2], name: 'Price pending', price: null };
  globalThis.fetch = async url => {
    calls.push(url);
    const page = new URL(url, 'http://test').searchParams.get('page');
    return Response.json({ items: page === '1' ? first : [{ ...base, id: 'service-100', name: 'Service 101' }], page: Number(page), limit: 100, total: 101 });
  };
  try {
    const Catalog = h.loadSource('ServiceCatalog.tsx').default;
    await h.React.act(async () => h.root.render(h.React.createElement(Catalog, { roomTypeId: 'type', supportsExtraBed: false })));
    assert.equal(calls.length, 0, 'only fetch services when the visitor opens the catalog');
    await h.React.act(async () => { h.dom.window.document.querySelector('details').open = true; });
    await h.waitFor(() => h.dom.window.document.body.textContent.includes('Service 101'));
    const doc = h.dom.window.document;
    assert.equal(calls.length, 2);
    assert.ok(calls.every(url => url.includes('roomTypeId=type')));
    assert.equal(doc.querySelectorAll('li').length, 100);
    assert.ok(!doc.body.textContent.includes('Extra bed'));
    assert.ok(doc.body.textContent.includes('รวมในค่าห้องแล้ว'));
    assert.ok(doc.body.textContent.includes('ราคายังรอยืนยัน'));
    assert.ok(doc.body.textContent.includes('ยังไม่รวมในยอดจองห้องพัก'));
    await h.React.act(async () => h.root.render(h.React.createElement(Catalog, { roomTypeId: 'type', supportsExtraBed: true })));
    assert.equal(doc.querySelectorAll('li').length, 101);
    assert.equal(calls.length, 2);
  } finally { await h.close(); globalThis.fetch = originalFetch; }
});

test('confirmed hotel contact channels appear as working links and unset channels have a clear fallback', async () => {
  const h = domApp('http://localhost:5173/', { VITE_CONTACT_PHONE: '+66 81 234 5678', VITE_CONTACT_EMAIL: 'hotel@example.test', VITE_CONTACT_URL: 'https://hotel.example.test/contact' });
  try {
    const Contact = h.loadSource('HotelContact.tsx').default;
    await h.React.act(async () => h.root.render(h.React.createElement(Contact)));
    const links = Array.from(h.dom.window.document.querySelectorAll('a'));
    assert.equal(links.length, 3);
    assert.equal(links[0].getAttribute('href'), 'tel:+66812345678');
    assert.equal(links[1].getAttribute('href'), 'mailto:hotel@example.test');
    assert.equal(links[2].getAttribute('rel'), 'noopener noreferrer');
  } finally { await h.close(); }
  const empty = domApp();
  try {
    const Contact = empty.loadSource('HotelContact.tsx').default;
    await empty.React.act(async () => empty.root.render(empty.React.createElement(Contact)));
    assert.equal(empty.dom.window.document.querySelectorAll('a').length, 0);
    assert.ok(empty.dom.window.document.body.textContent.includes('ช่องทางติดต่อออนไลน์ยังไม่พร้อม'));
  } finally { await empty.close(); }
});
