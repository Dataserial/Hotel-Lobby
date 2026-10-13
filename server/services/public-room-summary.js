const { validateStay, validateGuestCount, parseHotelDate } = require('./booking-validation');
const { roomBookable } = require('./room-bookability');
const DAY = 86400000;

async function publicRoomSummary(prisma, input, now = new Date()) {
  const stay = validateStay(input.checkInDate, input.checkOutDate);
  const guestCount = validateGuestCount(input.guestCount);
  const end = parseHotelDate(stay.checkOutDate).getTime();
  const previewDays = Math.min(14, Math.floor((parseHotelDate('9999-12-31').getTime() - end) / DAY) + 1);
  const ranges = Array.from({ length: previewDays }, (_, offset) => ({
    checkInDate: new Date(parseHotelDate(stay.checkInDate).getTime() + offset * DAY).toISOString().slice(0, 10),
    checkOutDate: new Date(end + offset * DAY).toISOString().slice(0, 10),
  }));
  return prisma.$transaction(async tx => {
    const inventory = await tx.room.findMany({ where: { active: true, roomTypeId: { not: null } }, include: { roomType: true }, orderBy: { number: 'asc' } });
    const rooms = inventory.filter(room => room.roomType?.active);
    const ids = rooms.map(room => room.id);
    const occupants = await tx.booking.findMany({ where: { roomId: { in: ids }, status: 'checked_in' }, select: { roomId: true, checkOutDate: true } });
    const claims = await tx.roomNightClaim.findMany({ where: { roomId: { in: ids }, night: { gte: stay.checkInDate, lt: ranges[ranges.length - 1].checkOutDate } }, select: { roomId: true, night: true } });
    const occupantsByRoom = new Map(ids.map(id => [id, []]));
    const claimsByRoom = new Map(ids.map(id => [id, []]));
    for (const occupant of occupants) occupantsByRoom.get(occupant.roomId).push(occupant);
    for (const claim of claims) claimsByRoom.get(claim.roomId).push(claim.night);
    const types = new Map();
    for (const { roomType: type } of rooms) if (!types.has(type.id)) types.set(type.id, {
      id: type.id, name: type.name, capacity: type.capacity, pricePerNight: type.basePrice,
      amenities: type.amenities, supportsExtraBed: type.supportsExtraBed, totalRooms: 0, availableRooms: 0,
      dates: ranges.map(range => ({ ...range, availableRooms: 0 })),
    });
    for (const room of rooms) {
      const type = types.get(room.roomType.id);
      type.totalRooms++;
      if (guestCount > type.capacity) continue;
      for (const [index, range] of ranges.entries()) {
        if (!await roomBookable(tx, room, range.checkInDate, now, occupantsByRoom.get(room.id))) continue;
        if (!claimsByRoom.get(room.id).some(night => night >= range.checkInDate && night < range.checkOutDate)) type.dates[index].availableRooms++;
      }
    }
    const roomTypes = Array.from(types.values()).sort((a, b) => a.pricePerNight - b.pricePerNight || a.name.localeCompare(b.name));
    for (const type of roomTypes) type.availableRooms = type.dates[0].availableRooms;
    return { checkInDate: stay.checkInDate, checkOutDate: stay.checkOutDate, guestCount, nights: stay.nightCount,
      previewDays, timezone: 'Asia/Bangkok', updatedAt: now.toISOString(),
      totalAvailableRooms: roomTypes.reduce((sum, type) => sum + type.availableRooms, 0), roomTypes };
  });
}
module.exports = { publicRoomSummary };
