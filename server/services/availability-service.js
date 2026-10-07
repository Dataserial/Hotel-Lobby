const { validateStay, validateGuestCount } = require('./booking-validation');

async function findAvailableRooms(prisma, { checkInDate, checkOutDate, guestCount }) {
  const { nights } = validateStay(checkInDate, checkOutDate);
  validateGuestCount(guestCount);

  const rooms = await prisma.room.findMany({
    where: { active: true, status: 'available', roomTypeId: { not: null } },
    include: { roomType: true },
    orderBy: { number: 'asc' },
  });
  const candidates = rooms.filter(({ roomType }) =>
    roomType && roomType.active && guestCount <= roomType.capacity);
  if (candidates.length === 0) return [];

  const claims = await prisma.roomNightClaim.findMany({
    where: {
      roomId: { in: candidates.map((room) => room.id) },
      night: { in: nights },
    },
    select: { roomId: true },
  });
  const claimedRoomIds = new Set(claims.map((claim) => claim.roomId));
  return candidates.filter((room) => !claimedRoomIds.has(room.id)).map((room) => ({
    roomId: room.id,
    roomNumber: room.number,
    roomType: room.roomType.name,
    capacity: room.roomType.capacity,
    pricePerNight: room.roomType.basePrice,
  }));
}

module.exports = { findAvailableRooms };
