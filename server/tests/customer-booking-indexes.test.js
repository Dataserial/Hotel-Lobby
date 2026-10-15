// ทดสอบดัชนีและเจ้าของข้อมูลจอง
const { startDatabase } = require('./task3-db');
const { prepareCustomerBooking } = require('../scripts/customer-booking-indexes');
let fixture;
beforeAll(async () => { fixture = await startDatabase('hotel_lobby_task5_test'); }, 180000);
afterAll(async () => { if (fixture) await fixture.stop(); });
test('additive preparation preserves legacy documents without assigning owners and is repeatable', async () => {
  const db = fixture.raw.db();
  const guest = { fullName: 'Legacy', phone: '0800000000', documentNo: 'LEGACY', documentNoKey: 'LEGACY' };
  await db.collection('guests').insertOne(guest);
  const before = await db.collection('guests').findOne({ documentNoKey: 'LEGACY' });
  await db.collection('guests').dropIndex('guests_customerId_createdAt_idx');
  const preview = await prepareCustomerBooking(db);
  expect(preview.additions).toContain('guests_customerId_createdAt_idx');
  expect((await db.collection('guests').listIndexes().toArray()).some(row => row.name === 'guests_customerId_createdAt_idx')).toBe(false);
  await prepareCustomerBooking(db, { apply: true });
  expect(await db.collection('guests').findOne({ documentNoKey: 'LEGACY' })).toEqual(before);
  expect((await prepareCustomerBooking(db, { apply: true })).additions).toEqual([]);
});
test('missing room-night protection stops release preparation', async () => {
  const db = fixture.raw.db();
  await db.collection('roomNightClaims').dropIndex('roomNightClaims_roomId_night_key');
  await expect(prepareCustomerBooking(db, { apply: true })).rejects.toThrow('Missing prerequisite unique index');
});
