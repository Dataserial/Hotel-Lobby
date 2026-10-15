// ทดสอบการคืน session หลังรีโหลดและการตรวจวันหมดอายุ
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { domApp } = require('./helpers/dom.cjs');
const sessionKey = 'hotel-lobby-session';
const member = name => ({ id: 'member', name, email: 'member@example.test', role: 'customer', active: true });
const emptyPage = () => Response.json({ items: [], total: 0, page: 1, limit: 20 });
async function mount(h) {
  const App = h.loadSource('App.tsx').default;
  await h.React.act(async () => h.root.render(h.React.createElement(App)));
}
// โหลดข้อมูลล่าสุดมาแสดง
async function reload(h) {
  await h.React.act(async () => h.root.render(null));
  await mount(h);
}

test('login survives a page reload with server-verified identity and the original expiry; logout clears it', async () => {
  const original = globalThis.fetch, h = domApp('http://localhost:5173/member');
  let verified = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/auth/login')) return Response.json({ token: 'persisted-token', expiresIn: 3600, user: member('Before refresh') });
    if (url.endsWith('/auth/me')) {
      verified++;
      assert.equal(options.headers.Authorization, 'Bearer persisted-token');
      return Response.json({ user: member('Verified after refresh') });
    }
    if (url.endsWith('/auth/logout')) throw new Error('Network unavailable');
    return emptyPage();
  };
  try {
    await mount(h);
    const doc = h.dom.window.document;
    await h.input(doc.querySelector('input[type="email"]'), 'member@example.test');
    await h.input(doc.querySelector('input[type="password"]'), 'member-password-123');
    await h.React.act(async () => doc.querySelector('.login-card').dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true })));
    const saved = JSON.parse(h.dom.window.sessionStorage.getItem(sessionKey));
    assert.equal(saved.token, 'persisted-token');
    assert.deepEqual(Object.keys(saved).sort(), ['expires', 'token']);
    assert.ok(!JSON.stringify(saved).includes('member-password-123'));
    await reload(h);
    await h.waitFor(() => doc.querySelector('.member-card'));
    assert.ok(doc.querySelector('.member-card').textContent.includes('Verified after refresh'));
    assert.equal(verified, 1);
    assert.equal(JSON.parse(h.dom.window.sessionStorage.getItem(sessionKey)).expires, saved.expires);
    await h.openAccount(); await h.React.act(async () => h.button('ออกจากระบบ').click());
    assert.equal(h.dom.window.sessionStorage.getItem(sessionKey), null);
    await reload(h);
    assert.ok(doc.querySelector('input[type="password"]'));
    assert.equal(verified, 1);
  } finally { await h.close(); globalThis.fetch = original; }
});

test('staff reload waits for verification and then restores the server role', async () => {
  const original = globalThis.fetch, h = domApp('http://localhost:5173/staff');
  let complete;
  h.dom.window.sessionStorage.setItem(sessionKey, JSON.stringify({ token: 'staff-token', expires: Date.now() + 3600000, user: member('Untrusted cached identity') }));
  globalThis.fetch = async url => {
    if (url.endsWith('/auth/me')) return new Promise(resolve => { complete = () => resolve(Response.json({ user: { ...member('Verified Admin'), role: 'admin' } })); });
    if (url.endsWith('/dashboard')) return Response.json({ date: '2026-10-14', availableRooms: 60, occupiedRooms: 0, arrivalsToday: 0, departuresToday: 0 });
    return emptyPage();
  };
  try {
    await mount(h);
    const doc = h.dom.window.document;
    assert.ok(doc.querySelector('[aria-busy="true"]'));
    assert.equal(doc.querySelector('input[type="password"]'), null);
    assert.equal(doc.querySelector('.shell'), null);
    await h.React.act(async () => complete());
    await h.waitFor(() => doc.querySelector('.shell'));
    assert.ok(doc.body.textContent.includes('Verified Admin'));
    assert.ok(doc.querySelector('.sidebar').textContent.includes('ผู้ใช้งาน'));
  } finally { await h.close(); globalThis.fetch = original; }
});

test('a revoked server session is cleared and returns to login', async () => {
  const original = globalThis.fetch, h = domApp('http://localhost:5173/member');
  h.dom.window.sessionStorage.setItem(sessionKey, JSON.stringify({ token: 'revoked-token', expires: Date.now() + 3600000 }));
  globalThis.fetch = async url => {
    assert.ok(url.endsWith('/auth/me'));
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Session revoked' } }, { status: 401 });
  };
  try {
    await mount(h);
    assert.equal(h.dom.window.sessionStorage.getItem(sessionKey), null);
    assert.ok(h.dom.window.document.querySelector('input[type="password"]'));
    assert.ok(h.dom.window.document.body.textContent.includes('เซสชันหมดอายุ'));
  } finally { await h.close(); globalThis.fetch = original; }
});

test('temporary verification failures retain the session and allow retry', async () => {
  const original = globalThis.fetch, h = domApp('http://localhost:5173/member');
  const saved = { token: 'retry-token', expires: Date.now() + 3600000 };
  h.dom.window.sessionStorage.setItem(sessionKey, JSON.stringify(saved));
  let attempts = 0;
  globalThis.fetch = async url => {
    if (url.endsWith('/auth/me')) return ++attempts === 1
      ? Response.json({ error: { code: 'UNAVAILABLE', message: 'Please retry' } }, { status: 503 })
      : Response.json({ user: member('Recovered Member') });
    return emptyPage();
  };
  try {
    await mount(h);
    assert.deepEqual(JSON.parse(h.dom.window.sessionStorage.getItem(sessionKey)), saved);
    assert.equal(h.dom.window.document.querySelector('input[type="password"]'), null);
    await h.React.act(async () => h.button('ลองเชื่อมต่ออีกครั้ง').click());
    assert.ok(h.dom.window.document.querySelector('.member-card').textContent.includes('Recovered Member'));
    assert.equal(attempts, 2);
  } finally { await h.close(); globalThis.fetch = original; }
});

test('expired or malformed saved sessions are discarded without sending credentials', async () => {
  for (const value of ['{bad-json', JSON.stringify({ token: 'expired', expires: Date.now() - 1 }), JSON.stringify({ token: '', expires: Date.now() + 3600000 })]) {
    const original = globalThis.fetch, h = domApp('http://localhost:5173/member');
    h.dom.window.sessionStorage.setItem(sessionKey, value);
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error('Unexpected authentication request'); };
    try {
      await mount(h);
      assert.equal(requests, 0);
      assert.equal(h.dom.window.sessionStorage.getItem(sessionKey), null);
      assert.ok(h.dom.window.document.querySelector('input[type="password"]'));
    } finally { await h.close(); globalThis.fetch = original; }
  }
});
