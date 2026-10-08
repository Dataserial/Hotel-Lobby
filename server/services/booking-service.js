const {
  BookingError,
  validateStay,
  validateGuestCount,
  calculatePrice,
} = require('./booking-validation');
const { assertLedger, summarize } = require('./payment-ledger');
const { assertActor, operationTransaction: bookingTransaction } = require('./operation-transaction');

function assertId(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{24}$/.test(value)) {
    throw new BookingError(400, 'INVALID_REFERENCE', `${field} must be an ObjectId.`);
  }
  return value;
}

async function assertGuest(tx, guestId) {
  assertId(guestId, 'guestId');
  const guest = await tx.guest.findUnique({ where: { id: guestId }, select: { id: true, active: true } });
  if (!guest || guest.active === false) {
    throw new BookingError(404, 'GUEST_NOT_FOUND', 'Guest does not exist.');
  }
}

async function bookableRoom(tx, roomId, guestCount) {
  assertId(roomId, 'roomId');
  const room = await tx.room.findUnique({
    where: { id: roomId },
    include: { roomType: true },
  });
  if (!room) throw new BookingError(404, 'ROOM_NOT_FOUND', 'Room does not exist.');
  if (!room.active || room.status !== 'available' || !room.roomType || !room.roomType.active) {
    throw new BookingError(409, 'ROOM_UNAVAILABLE', 'Room or room type is not available.');
  }
  validateGuestCount(guestCount, room.roomType.capacity);
  return room;
}

async function createClaims(tx, bookingId, roomId, nights) {
  try {
    await tx.roomNightClaim.createMany({
      data: nights.map((night) => ({ bookingId, roomId, night })),
    });
  } catch (error) {
    // Only a unique failure while inserting claims denotes unavailable nights.
    // Payment/Booking unique errors must retain their own meaning.
    if (error.code === 'P2002') {
      throw new BookingError(409, 'ROOM_UNAVAILABLE', 'The room was booked for one of these nights.');
    }
    throw error;
  }
}

function assertAllowedFields(input, fields) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.entries(input).some(([key, value]) => !fields.includes(key) || value == null)) {
    throw new BookingError(400, 'VALIDATION_ERROR', 'Unexpected booking field.');
  }
}

async function createBooking(prisma, input, actorId) {
  assertAllowedFields(input, ['guestId', 'roomId', 'guestCount', 'checkInDate', 'checkOutDate']);
  const stay = validateStay(input.checkInDate, input.checkOutDate);
  validateGuestCount(input.guestCount);
  return bookingTransaction(prisma, async (tx) => {
    await assertActor(tx, actorId);
    await assertGuest(tx, input.guestId);
    const room = await bookableRoom(tx, input.roomId, input.guestCount);
    const price = calculatePrice(room.roomType.basePrice, stay.nightCount);
    const booking = await tx.booking.create({
      data: {
        guestId: input.guestId,
        roomId: input.roomId,
        guestCount: input.guestCount,
        checkInDate: stay.checkInDate,
        checkOutDate: stay.checkOutDate,
        status: 'confirmed',
        ...price,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await createClaims(tx, booking.id, input.roomId, stay.nights);
    await tx.payment.create({
      data: {
        bookingId: booking.id,
        amount: price.totalPrice,
        paidAmount: 0,
        refundedAmount: 0,
        ledgerReady: true,
        status: price.totalPrice === 0 ? 'paid' : 'pending',
        recordedById: actorId,
      },
    });
    return booking;
  });
}

async function updateBooking(prisma, bookingId, changes, actorId) {
  assertId(bookingId, 'bookingId');
  assertAllowedFields(changes, ['guestId', 'roomId', 'guestCount', 'checkInDate', 'checkOutDate']);
  if (Object.keys(changes).length === 0) {
    throw new BookingError(400, 'VALIDATION_ERROR', 'Provide a booking field to update.');
  }
  return bookingTransaction(prisma, async (tx) => {
    await assertActor(tx, actorId);
    const current = await tx.booking.findUnique({
      where: { id: bookingId }, include: { payment: true },
    });
    if (!current) throw new BookingError(404, 'BOOKING_NOT_FOUND', 'Booking does not exist.');
    if (current.status !== 'confirmed') {
      throw new BookingError(409, 'INVALID_TRANSITION', 'Only confirmed bookings may be edited.');
    }
    const rows = await assertLedger(tx, current);
    const next = {
      guestId: changes.guestId ?? current.guestId,
      roomId: changes.roomId ?? current.roomId,
      guestCount: changes.guestCount ?? current.guestCount,
      checkInDate: changes.checkInDate ?? current.checkInDate,
      checkOutDate: changes.checkOutDate ?? current.checkOutDate,
    };
    const stay = validateStay(next.checkInDate, next.checkOutDate);
    validateGuestCount(next.guestCount);
    await assertGuest(tx, next.guestId);
    const room = await bookableRoom(tx, next.roomId, next.guestCount);
    // ObjectId hex casing does not change the selected room.
    next.roomId = room.id;
    const claimsChanged = next.roomId !== current.roomId ||
      next.checkInDate !== current.checkInDate || next.checkOutDate !== current.checkOutDate;
    const price = claimsChanged
      ? calculatePrice(room.roomType.basePrice, stay.nightCount)
      : { pricePerNight: current.pricePerNight, totalPrice: current.totalPrice };
    const netPaid = current.payment
      ? current.payment.paidAmount - current.payment.refundedAmount : 0;
    if (netPaid > 0 && price.totalPrice !== current.totalPrice) {
      throw new BookingError(409, 'PAYMENT_ADJUSTMENT_REQUIRED',
        'Adjust or refund received payment before changing the total.');
    }

    const booking = await tx.booking.update({
      where: { id: bookingId },
      data: { ...next, ...price, updatedById: actorId, version: current.version + 1 },
    });
    if (claimsChanged) {
      await tx.roomNightClaim.deleteMany({ where: { bookingId } });
      await createClaims(tx, bookingId, next.roomId, stay.nights);
    }
    if (current.payment && price.totalPrice !== current.payment.amount) {
      await tx.payment.update({
        where: { bookingId },
        data: summarize(booking, rows),
      });
    }
    return booking;
  });
}

async function cancelBooking(prisma, bookingId, actorId) {
  assertId(bookingId, 'bookingId');
  return bookingTransaction(prisma, async (tx) => {
    await assertActor(tx, actorId);
    const current = await tx.booking.findUnique({
      where: { id: bookingId }, include: { payment: true },
    });
    if (!current) throw new BookingError(404, 'BOOKING_NOT_FOUND', 'Booking does not exist.');
    if (current.status !== 'confirmed') {
      throw new BookingError(409, 'INVALID_TRANSITION', 'Only confirmed bookings may be cancelled.');
    }
    const rows = await assertLedger(tx, current);
    if (current.payment && current.payment.paidAmount - current.payment.refundedAmount > 0) {
      throw new BookingError(409, 'PAYMENT_REFUND_REQUIRED',
        'Refund and record received payment before cancellation.');
    }
    const booking = await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'cancelled', cancelledAt: new Date(), updatedById: actorId, version: current.version + 1 },
    });
    await tx.payment.update({ where: { id: current.payment.id }, data: summarize(booking, rows) });
    await tx.roomNightClaim.deleteMany({ where: { bookingId } });
    return booking;
  });
}

module.exports = { createBooking, updateBooking, cancelBooking };
