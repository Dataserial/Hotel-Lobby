const { createBooking, updateBooking, cancelBooking } = require('../services/booking-service');
const { startDatabase, expectConsistent, sample } = require('./task3-db');
const { instrument } = require('./task3-hooks');
const { recordTestReceipt, recordTestRefund } = require('./payment-fixture');

let db;
const actorId = sample.users[1]._id;
const input = (extra = {}) => ({
  guestId: sample.guests[0]._id, roomId: sample.rooms[0]._id, guestCount: 2,
  checkInDate: '2026-11-10', checkOutDate: '2026-11-12', ...extra,
});
beforeAll(async () => { db = await startDatabase(); }, 180000);
beforeEach(async () => db.reset());
afterAll(async () => { if (db) await db.stop(); }, 30000);

test('guest-only edits preserve paid snapshot; changed dates/room use current prices', async () => {
  const b = await createBooking(db.prisma, input(), actorId);
  const hexRoom = await db.prisma.room.create({ data: {
    id: '30000000000000000000000a', number: 'HEX', roomTypeId: sample.roomTypes[0]._id,
    active: true, status: 'available',
  } });
  const hexBooking = await createBooking(db.prisma, input({ roomId: hexRoom.id }), actorId);
  await db.prisma.roomType.update({ where: { nameKey: 'standard' }, data: { basePrice: 1700 } });
  expect(await updateBooking(db.prisma, hexBooking.id, { roomId: hexRoom.id.toUpperCase() }, actorId))
    .toMatchObject({ roomId: hexRoom.id, pricePerNight: 1200, totalPrice: 2400 });
  const receipt = await recordTestReceipt(db.prisma, b.id, actorId);
  expect(await updateBooking(db.prisma, b.id, { guestCount: 1, guestId: sample.guests[1]._id }, actorId))
    .toMatchObject({ pricePerNight: 1200, totalPrice: 2400 });
  expect(await updateBooking(db.prisma, b.id, { checkInDate: b.checkInDate }, actorId))
    .toMatchObject({ pricePerNight: 1200, totalPrice: 2400 });
  await expect(updateBooking(db.prisma, b.id, { checkOutDate: '2026-11-13' }, actorId))
    .rejects.toMatchObject({ code: 'PAYMENT_ADJUSTMENT_REQUIRED' });
  await expect(cancelBooking(db.prisma, b.id, actorId)).rejects.toMatchObject({ code: 'PAYMENT_REFUND_REQUIRED' });
  await recordTestRefund(db.prisma, b.id, actorId, receipt.id);
  expect(await updateBooking(db.prisma, b.id, { checkOutDate: '2026-11-13' }, actorId))
    .toMatchObject({ pricePerNight: 1700, totalPrice: 5100 });
  expect(await updateBooking(db.prisma, b.id, { roomId: sample.rooms[2]._id }, actorId))
    .toMatchObject({ pricePerNight: 1800, totalPrice: 5400 });
  await expectConsistent(db.prisma);
});

test.each(['create', 'update', 'cancel'])('%s retries the full aborted transaction and re-reads actor', async (operation) => {
  const existing = operation === 'create' ? null : await createBooking(db.prisma, input(), actorId);
  let actorReads = 0, failures = 0;
  const client = instrument(db.prisma, async ({ model, method, run }) => {
    const result = await run();
    if (model === 'user' && method === 'findUnique') actorReads++;
    const lastWrite = operation === 'create' ? model === 'payment' && method === 'create' :
      operation === 'update' ? model === 'payment' && method === 'update' :
        model === 'roomNightClaim' && method === 'deleteMany';
    if (lastWrite && failures++ < 2) throw Object.assign(new Error('Injected transaction abort'), { code: 'P2034' });
    return result;
  });
  if (operation === 'create') await createBooking(client, input(), actorId);
  if (operation === 'update') await updateBooking(client, existing.id, { checkOutDate: '2026-11-13' }, actorId);
  if (operation === 'cancel') await cancelBooking(client, existing.id, actorId);
  expect(actorReads).toBe(3);
  expect(await db.prisma.booking.count()).toBe(sample.bookings.length + 1);
  await expectConsistent(db.prisma);
});

test.each(['create', 'update', 'cancel'])('%s stops after three transient attempts', async (operation) => {
  const tx = jest.fn().mockRejectedValue(Object.assign(new Error('Write conflict'), { code: 'P2034' }));
  const client = { $transaction: tx };
  const promise = operation === 'create' ? createBooking(client, input(), actorId) :
    operation === 'update' ? updateBooking(client, sample.bookings[1]._id, { guestCount: 1 }, actorId) :
      cancelBooking(client, sample.bookings[1]._id, actorId);
  await expect(promise).rejects.toMatchObject({ status: 409, code: 'WRITE_CONFLICT' });
  expect(tx).toHaveBeenCalledTimes(3);
});

test('a payment unique failure is not translated to room unavailable or retried', async () => {
  let calls = 0;
  const client = instrument(db.prisma, async ({ model, method, run }) => {
    const result = await run();
    if (model === 'payment' && method === 'create') {
      calls++;
      throw Object.assign(new Error('Injected payment duplicate'), { code: 'P2002' });
    }
    return result;
  });
  await expect(createBooking(client, input(), actorId)).rejects.toMatchObject({ code: 'P2002' });
  expect(calls).toBe(1);
  expect(await db.prisma.booking.count()).toBe(sample.bookings.length);
  await expectConsistent(db.prisma);
});
