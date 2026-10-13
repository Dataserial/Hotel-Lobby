const express = require('express');
const { asyncRoute, objectId, fail } = require('../lib/http');
const { validateStay } = require('../services/booking-validation');
const { roomBookable } = require('../services/room-bookability');

module.exports = prisma => {
  const router = express.Router();
  router.get('/', asyncRoute(async (req, res) => {
    if (Object.keys(req.query).some(key => !['checkInDate', 'checkOutDate', 'roomTypeId'].includes(key))) fail(400, 'VALIDATION_ERROR', 'Unexpected query');
    const stay = validateStay(req.query.checkInDate, req.query.checkOutDate);
    const roomTypeId = objectId(req.query.roomTypeId, 'roomTypeId');
    const type = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
    if (!type?.active) fail(404, 'ROOM_TYPE_NOT_FOUND', 'Room type unavailable');
    const rooms = await prisma.room.findMany({ where: { roomTypeId, active: true }, orderBy: { number: 'asc' } });
    const claims = await prisma.roomNightClaim.findMany({ where: { roomId: { in: rooms.map(room => room.id) }, night: { in: stay.nights } }, select: { roomId: true } });
    const claimed = new Set(claims.map(claim => claim.roomId));
    const items = await Promise.all(rooms.map(async room => ({
      roomId: room.id, roomNumber: room.number,
      status: room.status === 'maintenance' ? 'maintenance' :
        !claimed.has(room.id) && await roomBookable(prisma, { ...room, roomType: type }, stay.checkInDate) ? 'available' : 'unavailable',
    })));
    res.json({ roomType: { id: type.id, name: type.name, capacity: type.capacity, pricePerNight: type.basePrice, amenities: type.amenities }, items });
  }));
  return router;
};
