const { roomBookable } = require('./room-bookability');
const { heldClaims } = require('./room-night-claims');

// Both public views share the staff inventory rules and read one snapshot.
async function roomGrid(tx, type, stay) {
  const rooms = await tx.room.findMany({ where: { roomTypeId: type.id, active: true } });
  rooms.sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true }));
  const ids = rooms.map(room => room.id);
  const claims = await tx.roomNightClaim.findMany({ where: { ...heldClaims, roomId: { in: ids }, night: { in: stay.nights } }, select: { roomId: true } });
  const occupants = await tx.booking.findMany({ where: { roomId: { in: ids }, status: 'checked_in' }, select: { roomId: true, checkOutDate: true } });
  const claimed = new Set(claims.map(claim => claim.roomId));
  const now = new Date();
  const items = await Promise.all(rooms.map(async room => ({
    roomId: room.id, roomNumber: room.number,
    status: room.status === 'maintenance' ? 'maintenance' :
      !claimed.has(room.id) && await roomBookable(tx, { ...room, roomType: type }, stay.checkInDate, now, occupants.filter(row => row.roomId === room.id)) ? 'available' : 'unavailable',
  })));
  return { roomType: { id: type.id, name: type.name, capacity: type.capacity, pricePerNight: type.basePrice, amenities: type.amenities }, items };
}

module.exports = { roomGrid };
