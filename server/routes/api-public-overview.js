const express = require('express');
const { asyncRoute, fail } = require('../lib/http');
const { hotelToday } = require('../services/stay-service');
const { findAvailableRooms } = require('../services/availability-service');

module.exports = prisma => {
  const router = express.Router();
  router.get('/', asyncRoute(async (req, res) => {
    if (Object.keys(req.query).length) fail(400, 'VALIDATION_ERROR', 'Overview does not accept query fields');
    const now = new Date();
    const date = hotelToday(now);
    const checkOutDate = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    const overview = await prisma.$transaction(async tx => {
      const types = await tx.roomType.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, capacity: true, basePrice: true, amenities: true } });
      const rooms = await tx.room.findMany({ where: { active: true, roomTypeId: { in: types.map(type => type.id) } }, select: { id: true, roomTypeId: true } });
      const available = await findAvailableRooms(tx, { checkInDate: date, checkOutDate, guestCount: 1, now });
      const availableIds = new Set(available.map(room => room.roomId));
      const bookedRooms = await tx.booking.count({ where: { roomId: { in: rooms.map(room => room.id) }, status: { in: ['confirmed', 'checked_in'] }, checkInDate: { lt: checkOutDate }, checkOutDate: { gt: date } } });
      return {
        totalRooms: rooms.length, availableRooms: available.length, bookedRooms,
        roomTypes: types.map(type => {
          const inventory = rooms.filter(room => room.roomTypeId === type.id);
          return { id: type.id, name: type.name, capacity: type.capacity, pricePerNight: type.basePrice, amenities: type.amenities, totalRooms: inventory.length, availableRooms: inventory.filter(room => availableIds.has(room.id)).length };
        }).filter(type => type.totalRooms > 0),
      };
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ date, checkOutDate, timezone: 'Asia/Bangkok', updatedAt: now.toISOString(), ...overview });
  }));
  return router;
};
