const { hotelToday } = require('./stay-service');

// Physical readiness is still enforced by check-in. Advance inventory uses stays/claims.
async function roomBookable(prisma, room, checkInDate, now = new Date(), knownOccupants) {
  if (!room.active || !room.roomType?.active) return false;
  if (room.status === 'available') return true;
  if (room.status !== 'occupied' || process.env.ALLOW_FUTURE_OCCUPIED_BOOKINGS === 'false') return false;
  const occupants = knownOccupants ?? await prisma.booking.findMany({ where: { roomId: room.id, status: 'checked_in' }, select: { checkOutDate: true } });
  const today = hotelToday(now);
  // Missing/contradictory occupancy or a due/overdue stay is held for staff resolution.
  return occupants.length === 1 && occupants[0].checkOutDate > today && checkInDate >= occupants[0].checkOutDate;
}
module.exports = { roomBookable };
