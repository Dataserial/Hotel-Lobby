const { startDatabase, sample, expectConsistent } = require('./task3-db');
const { createBooking } = require('../services/booking-service');
const { checkIn, checkOut, hotelToday } = require('../services/stay-service');
const { recordTestReceipt } = require('./payment-fixture');
let db;
const actorId = sample.users[1]._id;
const input = { guestId: sample.guests[0]._id, roomId: sample.rooms[0]._id, guestCount: 2, checkInDate: '2026-11-01', checkOutDate: '2026-11-03' };
const at = (value) => () => new Date(value);
const start = at('2026-10-31T17:00:00Z');
beforeAll(async () => { db = await startDatabase('hotel_lobby_task4_test'); }, 180000);
beforeEach(async () => db.reset());
afterAll(async () => { if (db) await db.stop(); }, 30000);
test('Bangkok midnight boundaries and late arrival within booked dates', async () => {
  const b = await createBooking(db.prisma, input, actorId);
  expect(hotelToday(new Date('2026-10-31T16:59:59Z'))).toBe('2026-10-31');
  expect(hotelToday(start())).toBe('2026-11-01');
  await expect(checkIn(db.prisma, b.id, actorId, at('2026-10-31T16:59:59Z'))).rejects.toMatchObject({ code: 'CHECK_IN_DATE_REQUIRED' });
  await expect(checkIn(db.prisma, b.id, actorId, at('2026-11-02T17:00:00Z'))).rejects.toMatchObject({ code: 'CHECK_IN_DATE_REQUIRED' });
  expect(await checkIn(db.prisma, b.id, actorId, at('2026-11-02T01:00:00Z'))).toMatchObject({ status: 'checked_in', actualCheckInAt: new Date('2026-11-02T01:00:00Z'), updatedById: actorId });
  await expect(checkIn(db.prisma, b.id, actorId, start)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
});
test('unpaid check-in allowed, checkout requires full payment, early exit retains claims', async () => {
  const b = await createBooking(db.prisma, input, actorId);
  await checkIn(db.prisma, b.id, actorId, start);
  expect((await db.prisma.room.findUnique({ where: { id: b.roomId } })).status).toBe('occupied');
  await expect(checkOut(db.prisma, b.id, actorId, start)).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED' });
  await recordTestReceipt(db.prisma, b.id, actorId, 2400);
  expect(await checkOut(db.prisma, b.id, actorId, start)).toMatchObject({ status: 'checked_out', actualCheckOutAt: start() });
  expect((await db.prisma.room.findUnique({ where: { id: b.roomId } })).status).toBe('available');
  expect(await db.prisma.roomNightClaim.count({ where: { bookingId: b.id } })).toBe(2);
  await expect(checkOut(db.prisma, b.id, actorId, start)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  await expectConsistent(db.prisma);
});
test.each(['maintenance', 'occupied'])('room %s cannot check in', async (status) => {
  const b = await createBooking(db.prisma, input, actorId);
  await db.prisma.room.update({ where: { id: b.roomId }, data: { status } });
  await expect(checkIn(db.prisma, b.id, actorId, start)).rejects.toMatchObject({ code: 'ROOM_NOT_READY' });
  expect((await db.prisma.booking.findUnique({ where: { id: b.id } })).status).toBe('confirmed');
});
test('inactive type and wrong checkout room state block transitions', async () => {
  const b = await createBooking(db.prisma, input, actorId);
  const room = await db.prisma.room.findUnique({ where: { id: b.roomId } });
  await db.prisma.roomType.update({ where: { id: room.roomTypeId }, data: { active: false } });
  await expect(checkIn(db.prisma, b.id, actorId, start)).rejects.toMatchObject({ code: 'ROOM_NOT_READY' });
  await db.prisma.roomType.update({ where: { id: room.roomTypeId }, data: { active: true } });
  await checkIn(db.prisma, b.id, actorId, start);
  await db.prisma.room.update({ where: { id: b.roomId }, data: { status: 'available' } });
  await expect(checkOut(db.prisma, b.id, actorId, start)).rejects.toMatchObject({ code: 'ROOM_NOT_READY' });
});
test('a conflicting checked-in booking blocks both entry and exit even when room status looks valid', async () => {
  const b = await createBooking(db.prisma, input, actorId);
  const other = await createBooking(db.prisma, { ...input, checkInDate: '2026-11-04', checkOutDate: '2026-11-05' }, actorId);
  // Deliberately corrupt fixture: an overdue stay still occupies a room whose flag
  // was incorrectly reset. The operation must inspect bookings, not just Room.
  await db.prisma.booking.update({ where: { id: other.id }, data: { status: 'checked_in' } });
  await expect(checkIn(db.prisma, b.id, actorId, start)).rejects.toMatchObject({ code: 'ROOM_NOT_READY' });
  await db.prisma.booking.update({ where: { id: b.id }, data: { status: 'checked_in' } });
  await db.prisma.room.update({ where: { id: b.roomId }, data: { status: 'occupied' } });
  await expect(checkOut(db.prisma, b.id, actorId, start)).rejects.toMatchObject({ code: 'ROOM_NOT_READY' });
});
test('inactive room and unverified ledger cannot check in', async () => {
  const b = await createBooking(db.prisma, input, actorId);
  await db.prisma.room.update({ where: { id: b.roomId }, data: { active: false } });
  await expect(checkIn(db.prisma, b.id, actorId, start)).rejects.toMatchObject({ code: 'ROOM_NOT_READY' });
  await db.prisma.room.update({ where: { id: b.roomId }, data: { active: true } });
  await db.prisma.payment.update({ where: { bookingId: b.id }, data: { ledgerReady: false } });
  await expect(checkIn(db.prisma, b.id, actorId, start)).rejects.toMatchObject({ code: 'PAYMENT_RECONCILIATION_REQUIRED' });
});
test('zero price stays check out without artificial receipt records', async () => {
  await db.prisma.roomType.update({ where: { nameKey: 'standard' }, data: { basePrice: 0 } });
  const b = await createBooking(db.prisma, input, actorId);
  await checkIn(db.prisma, b.id, actorId, start);
  await checkOut(db.prisma, b.id, actorId, start);
  const payment = await db.prisma.payment.findUnique({ where: { bookingId: b.id } });
  expect(payment.status).toBe('paid');
  expect(await db.prisma.paymentTransaction.count({ where: { paymentId: payment.id } })).toBe(0);
});
