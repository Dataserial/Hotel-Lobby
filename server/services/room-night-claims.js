const { BookingError } = require('./booking-validation');

// Older checkouts kept claims. Ignore only completed stays; other holds remain blocking.
const heldClaims = { NOT: { booking: { is: { status: 'checked_out' } } } };

async function createClaims(tx, bookingId, roomId, nights) {
  // Reclaim legacy checkout holds in the same transaction as the new reservation.
  await tx.roomNightClaim.deleteMany({ where: {
    roomId, night: { in: nights }, booking: { is: { status: 'checked_out' } },
  } });
  try {
    await tx.roomNightClaim.createMany({ data: nights.map(night => ({ bookingId, roomId, night })) });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new BookingError(409, 'ROOM_UNAVAILABLE', 'The room was booked for one of these nights.');
    }
    throw error;
  }
}

module.exports = { heldClaims, createClaims };
