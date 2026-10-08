const { fail, objectId } = require('../lib/http');
const { validateGuestCount } = require('./booking-validation');
const { assertLedger } = require('./payment-ledger');
const { assertActor, operationTransaction } = require('./operation-transaction');

function hotelToday(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((p) => p.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

async function stayOperation(prisma, bookingId, actorId, kind, clock) {
  bookingId = objectId(bookingId).toLowerCase();
  return operationTransaction(prisma, async (tx) => {
    await assertActor(tx, actorId);
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { payment: true } });
    if (!booking) fail(404, 'BOOKING_NOT_FOUND', 'Booking does not exist');
    const checkingIn = kind === 'check-in';
    if (booking.status !== (checkingIn ? 'confirmed' : 'checked_in')) fail(409, 'INVALID_TRANSITION', 'Invalid stay transition');
    await assertLedger(tx, booking);
    const now = clock();
    const room = await tx.room.findUnique({ where: { id: booking.roomId }, include: { roomType: true } });
    if (!room) fail(409, 'ROOM_NOT_READY', 'Booking room is missing');
    const otherOccupants = await tx.booking.count({ where: { roomId: room.id, status: 'checked_in', id: { not: bookingId } } });
    if (otherOccupants) fail(409, 'ROOM_NOT_READY', 'Room is assigned to another active stay');
    if (checkingIn) {
      const today = hotelToday(now);
      if (today < booking.checkInDate || today >= booking.checkOutDate) fail(409, 'CHECK_IN_DATE_REQUIRED', 'Check-in must be within the booked hotel dates');
      if (!room.active || !room.roomType?.active || room.status !== 'available') fail(409, 'ROOM_NOT_READY', 'Active available room and type required');
      validateGuestCount(booking.guestCount, room.roomType.capacity);
    } else {
      if (room.status !== 'occupied') fail(409, 'ROOM_NOT_READY', 'Checked-in booking must occupy its room');
      if (booking.payment.status !== 'paid' || booking.payment.paidAmount - booking.payment.refundedAmount !== booking.totalPrice) {
        fail(409, 'PAYMENT_REQUIRED', 'Full net payment is required before check-out');
      }
    }
    const updated = await tx.booking.update({ where: { id: bookingId }, data: {
      status: checkingIn ? 'checked_in' : 'checked_out',
      ...(checkingIn ? { actualCheckInAt: now } : { actualCheckOutAt: now }),
      version: booking.version + 1, updatedById: actorId,
    } });
    const changed = await tx.room.updateMany({
      where: { id: room.id, status: checkingIn ? 'available' : 'occupied', ...(checkingIn ? { active: true } : {}) },
      data: { status: checkingIn ? 'occupied' : 'available', updatedById: actorId },
    });
    if (changed.count !== 1) fail(409, 'ROOM_NOT_READY', 'Room state changed');
    return updated;
  });
}
const checkIn = (prisma, id, actorId, clock = () => new Date()) => stayOperation(prisma, id, actorId, 'check-in', clock);
const checkOut = (prisma, id, actorId, clock = () => new Date()) => stayOperation(prisma, id, actorId, 'check-out', clock);
module.exports = { checkIn, checkOut, hotelToday };
