// ค้นหาห้องว่างด้วยกฎเดียวกันทั้งลูกค้าและพนักงาน
const { validateStay, validateGuestCount } = require('./booking-validation');
const { objectId, fail } = require('../lib/http');
const { roomBookable } = require('./room-bookability');
const { heldClaims } = require('./room-night-claims');

// หาห้องพร้อมใช้ที่ไม่มีสิทธิ์กันห้องทับคืนที่เลือก
async function findAvailableRooms(prisma, { checkInDate, checkOutDate, guestCount, roomTypeId, excludeBookingId, now = new Date() }) {
  const { nights } = validateStay(checkInDate, checkOutDate);
  validateGuestCount(guestCount);
  if (roomTypeId !== undefined) roomTypeId = objectId(roomTypeId, 'roomTypeId').toLowerCase();
  if (excludeBookingId !== undefined) {
    excludeBookingId = objectId(excludeBookingId, 'excludeBookingId').toLowerCase();
    const booking = await prisma.booking.findUnique({ where: { id: excludeBookingId } });
    if (!booking) fail(404, 'BOOKING_NOT_FOUND', 'Booking does not exist');
    if (booking.status !== 'confirmed') fail(409, 'INVALID_TRANSITION', 'Only confirmed bookings may be edited');
  }

  const rooms = await prisma.room.findMany({
    where: { active: true, status: { in: ['available', 'occupied'] }, roomTypeId: roomTypeId ?? { not: null } },
    include: { roomType: true },
    orderBy: { number: 'asc' },
  });
  const ready = await Promise.all(rooms.map(room => roomBookable(prisma, room, checkInDate, now)));
  const candidates = rooms.filter(({ roomType }, index) => ready[index] && roomType && guestCount <= roomType.capacity);
  if (candidates.length === 0) return [];

  const claims = await prisma.roomNightClaim.findMany({
    where: {
      ...heldClaims,
      roomId: { in: candidates.map((room) => room.id) },
      night: { in: nights },
      ...(excludeBookingId ? { bookingId: { not: excludeBookingId } } : {}),
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
