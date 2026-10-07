const {
  BookingError,
  validateStay,
  validateGuestCount,
  calculatePrice,
} = require('./booking-validation');

function assertId(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{24}$/.test(value)) {
    throw new BookingError(400, 'INVALID_REFERENCE', `${field} must be an ObjectId.`);
  }
  return value;
}

async function assertActor(tx, actorId) {
  assertId(actorId, 'actorId');
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { active: true } });
  if (!actor || !actor.active) {
    throw new BookingError(403, 'INVALID_ACTOR', 'Actor must be an active user.');
  }
}

async function assertGuest(tx, guestId) {
  assertId(guestId, 'guestId');
  if (!await tx.guest.findUnique({ where: { id: guestId }, select: { id: true } })) {
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

function isClaimConflict(error) {
  return error && (error.code === 'P2002' || error.code === 'P2034');
}

function translateClaimConflict(error) {
  if (isClaimConflict(error)) {
    throw new BookingError(409, 'ROOM_UNAVAILABLE', 'The room was booked for one of these nights.');
  }
  throw error;
}

function assertAllowedFields(input, fields) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !fields.includes(key))) {
    throw new BookingError(400, 'VALIDATION_ERROR', 'Unexpected booking field.');
  }
}

async function createBooking(prisma, input, actorId) {
  assertAllowedFields(input, ['guestId', 'roomId', 'guestCount', 'checkInDate', 'checkOutDate']);
  const stay = validateStay(input.checkInDate, input.checkOutDate);
  validateGuestCount(input.guestCount);
  try {
    return await prisma.$transaction(async (tx) => {
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
      await tx.roomNightClaim.createMany({
        data: stay.nights.map((night) => ({ bookingId: booking.id, roomId: input.roomId, night })),
      });
      await tx.payment.create({
        data: {
          bookingId: booking.id,
          amount: price.totalPrice,
          paidAmount: 0,
          refundedAmount: 0,
          status: price.totalPrice === 0 ? 'paid' : 'pending',
          recordedById: actorId,
        },
      });
      return booking;
    });
  } catch (error) {
    translateClaimConflict(error);
  }
}

module.exports = { createBooking };

