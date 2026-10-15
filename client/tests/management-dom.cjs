// ทดสอบหน้าจัดการโรงแรมด้วย DOM และ Backend จริง
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { domApp } = require('./helpers/dom.cjs');

async function setup(role) {
  const { startDatabase } = require('../../server/tests/task3-db');
  const { createApp } = require('../../server/app');
  const db = await startDatabase('hotel_lobby_task5_test');
  let server, h;
  try {
    await db.reset();
    const user = await db.prisma.user.create({ data: { name: 'GUI ' + role, email: 'gui-' + role + '@example.test', role,
      passwordHash: await require('../../server/node_modules/bcryptjs').hash('gui-password-123', 4) } });
    const type = await db.prisma.roomType.create({ data: { name: 'GUI Type', nameKey: 'gui-type', capacity: 2, basePrice: 1200, amenities: [] } });
    const room = await db.prisma.room.create({ data: { number: 'GUI-101', roomTypeId: type.id, status: 'available', active: true } });
    const guest = await db.prisma.guest.create({ data: { fullName: 'GUI Guest', phone: '0812345678', documentNo: 'GUI-DOCUMENT', documentNoKey: 'GUI-DOCUMENT', active: true } });
    const today = require('../../server/services/stay-service').hotelToday(new Date());
    const day = offset => new Date(Date.parse(today + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
    const booking = await require('../../server/services/booking-service').createBooking(db.prisma,
      { roomId: room.id, guestId: guest.id, guestCount: 2, checkInDate: day(2), checkOutDate: day(3) }, user.id);
    server = createApp(db.prisma).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    h = domApp('http://localhost:5173/staff', { VITE_API_BASE_URL: 'http://127.0.0.1:' + server.address().port + '/api' });
    h.dom.window.confirm = () => true;
    const App = h.loadSource('App.tsx').default;
    await h.React.act(async () => h.root.render(h.React.createElement(App)));
    const doc = h.dom.window.document;
    await h.input(doc.querySelector('input[type="email"]'), user.email);
    await h.input(doc.querySelector('input[type="password"]'), 'gui-password-123');
    await h.React.act(async () => doc.querySelector('.login-card').dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true })));
    await h.waitFor(() => doc.querySelector('.shell'));
    const click = element => h.React.act(async () => element.click());
    const select = (element, value) => h.React.act(async () => { element.value = value; element.dispatchEvent(new h.dom.window.Event('change', { bubbles: true })); });
    // ตรวจข้อมูลและส่งคำขอของฟอร์ม
    const submit = element => h.React.act(async () => element.dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true })));
    return { db, h, doc, room, type, guest, booking, click, select, submit,
      async close() { await h.React.act(async () => { h.root.render(null); await new Promise(resolve => setTimeout(resolve, 50)); }); await h.close(); await new Promise(resolve => server.close(resolve)); await db.stop(); } };
  } catch (error) {
    if (h) await h.close(); if (server) await new Promise(resolve => server.close(resolve)); await db.stop(); throw error;
  }
}

test('admin service forms, pagination, guest archival and booking filters work against the real backend', { timeout: 180000 }, async () => {
  const f = await setup('admin');
  const { h, doc, db, type, room, guest, click, select, submit } = f;
  const row = (selector, text) => Array.from(doc.querySelectorAll(selector)).find(element => element.textContent.includes(text));
  try {
    await click(h.button('ห้องพัก / ประเภท'));
    await h.waitFor(() => doc.querySelector('.service-manager') && h.button('＋ เพิ่มบริการ'));
    assert.ok(!doc.querySelector('.sidebar').textContent.includes('คำขอเข้าพัก'));
    await click(h.button('＋ เพิ่มบริการ'));
    await h.waitFor(() => row('.service-type-options label', 'GUI Type'));
    await h.input(doc.querySelector('.service-definition-form input[maxlength="80"]'), 'Breakfast GUI');
    await h.input(doc.querySelector('.service-definition-form input[type="number"]'), '300');
    await click(row('.service-type-options label', 'GUI Type').querySelector('input'));
    await submit(doc.querySelector('.service-definition-form'));
    await h.waitFor(() => row('.service-definition-list article', 'Breakfast GUI'));
    const saved = await db.prisma.additionalService.findFirst({ where: { name: 'Breakfast GUI' } });
    assert.equal(saved.price, 300); assert.deepEqual(saved.roomTypeIds, [type.id]);
    await click(row('.service-definition-list article', 'Breakfast GUI').querySelector('button'));
    await h.input(doc.querySelector('.service-definition-form input[type="number"]'), '400');
    await submit(doc.querySelector('.service-definition-form'));
    await h.waitFor(() => !doc.querySelector('.service-definition-form'));
    assert.equal((await db.prisma.additionalService.findUnique({ where: { id: saved.id } })).price, 400);

    await h.React.act(async () => { await db.prisma.additionalService.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ name: 'Paging ' + String(index).padStart(3, '0'), nameKey: 'paging-' + index, unit: 'per_stay', price: index, included: false, extraBed: false, roomTypeIds: [], maxQuantity: 1, active: true })) }); });
    await h.input(doc.querySelector('input[aria-label="ค้นหาบริการเพิ่มเติม"]'), 'Paging');
    await submit(doc.querySelector('.service-manager .toolbar'));
    await h.waitFor(() => doc.querySelector('.service-manager .pagination')?.textContent.includes('101 รายการ'));
    for (let page = 2; page <= 6; page++) {
      await click(doc.querySelector('.service-manager .pagination button:last-child'));
      await h.waitFor(() => doc.querySelector('.service-manager .pagination').textContent.includes('หน้า ' + page) && !!doc.querySelector('.service-definition-list'));
    }
    assert.ok(row('.service-definition-list article', 'Paging 100'));
    assert.equal(doc.querySelectorAll('.service-definition-list article').length, 1);

    await click(h.button('ผู้เข้าพัก'));
    await h.waitFor(() => row('.panel tbody tr', 'GUI Guest'));
    await click(Array.from(row('.panel tbody tr', 'GUI Guest').querySelectorAll('button')).find(button => button.textContent === 'เก็บถาวร'));
    await h.waitFor(() => row('.panel tbody tr', 'GUI Guest')?.textContent.includes('เปิดใช้งานอีกครั้ง'));
    assert.equal((await db.prisma.guest.findUnique({ where: { id: guest.id } })).active, false);
    assert.equal(await db.prisma.booking.count({ where: { guestId: guest.id } }), 1);
    await click(h.button('เปิดใช้งานอีกครั้ง'));
    await h.waitFor(() => row('.panel tbody tr', 'GUI Guest')?.textContent.includes('เก็บถาวร') && !row('.panel tbody tr', 'GUI Guest').textContent.includes('เปิดใช้งานอีกครั้ง'));
    assert.equal((await db.prisma.guest.findUnique({ where: { id: guest.id } })).active, true);

    await click(h.button('การจอง'));
    const details = doc.querySelector('.booking-filter-panel');
    await h.React.act(async () => { details.open = true; });
    await h.waitFor(() => doc.querySelector('select[aria-label="ผู้เข้าพักที่ค้นหา"] option[value="' + guest.id + '"]'));
    await select(doc.querySelector('select[aria-label="ผู้เข้าพักที่ค้นหา"]'), guest.id);
    await h.waitFor(() => doc.querySelectorAll('.panel tbody tr').length === 1 && doc.querySelector('.panel tbody').textContent.includes('GUI Guest'));
    await click(h.button('รายละเอียด'));
    await h.waitFor(() => doc.querySelector('.booking-modal'));
    assert.ok(doc.querySelector('.booking-modal').textContent.includes('เช็กเอาต์จริง (เวลาไทย)'));
    await click(doc.querySelector('.booking-modal button[aria-label="ปิด"]'));
    await click(h.button('ห้องพัก / ประเภท'));
    await h.waitFor(() => row('.panel tbody tr', 'GUI-101'));
    await click(Array.from(row('.panel tbody tr', 'GUI-101').querySelectorAll('button')).find(button => button.textContent === 'ลบห้อง'));
    await h.waitFor(() => doc.querySelector('.notice.error'));
    assert.ok(doc.querySelector('.notice.error').textContent.includes('ประวัติอ้างอิง'));
    assert.ok(await db.prisma.room.findUnique({ where: { id: room.id } }));
  } finally { await f.close(); }
});

test('receptionists have room filters but cannot access admin service settings or room deletion', { timeout: 180000 }, async () => {
  const f = await setup('receptionist');
  try {
    await f.click(f.h.button('ห้องพัก / ประเภท'));
    await f.h.waitFor(() => f.doc.querySelector('.panel tbody tr'));
    assert.equal(f.doc.querySelector('.service-manager'), null);
    assert.ok(!f.doc.body.textContent.includes('ลบห้อง'));
    assert.ok(f.doc.querySelector('.toolbar').textContent.includes('สถานะห้อง'));
    assert.ok(!f.doc.querySelector('.sidebar').textContent.includes('คำขอเข้าพัก'));
  } finally { await f.close(); }
});
