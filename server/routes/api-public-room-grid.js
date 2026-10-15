// API เลขห้องที่เลือกได้ตามวันเข้าพัก
const express = require('express');
const { asyncRoute, objectId, fail } = require('../lib/http');
const { validateStay } = require('../services/booking-validation');
const { roomGrid } = require('../services/public-room-grid');
const { hotelToday } = require('../services/stay-service');

// อ่านวันที่และจำนวนคนจากคำขอค้นหาห้อง
function selectedStay(query) {
  const stay = validateStay(query.checkInDate, query.checkOutDate);
  if (stay.checkInDate < hotelToday(new Date())) fail(400, 'INVALID_DATE_RANGE', 'Check-in date is in the past');
  return stay;
}

module.exports = prisma => {
  const router = express.Router();
  // อ่านข้อมูล /types
  router.get('/types', asyncRoute(async (req, res) => {
    if (Object.keys(req.query).some(key => !['checkInDate', 'checkOutDate'].includes(key))) fail(400, 'VALIDATION_ERROR', 'Unexpected query');
    const stay = selectedStay(req.query);
    const items = await prisma.$transaction(async tx => {
      const types = await tx.roomType.findMany({ where: { active: true }, orderBy: { basePrice: 'asc' } });
      return Promise.all(types.map(async type => {
        const grid = await roomGrid(tx, type, stay);
        return { ...grid.roomType, totalRooms: grid.items.length, availableRooms: grid.items.filter(room => room.status === 'available').length };
      }));
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items });
  }));
  // อ่านข้อมูล /
  router.get('/', asyncRoute(async (req, res) => {
    if (Object.keys(req.query).some(key => !['checkInDate', 'checkOutDate', 'roomTypeId'].includes(key))) fail(400, 'VALIDATION_ERROR', 'Unexpected query');
    const stay = selectedStay(req.query);
    const roomTypeId = objectId(req.query.roomTypeId, 'roomTypeId');
    const data = await prisma.$transaction(async tx => {
      const type = await tx.roomType.findUnique({ where: { id: roomTypeId } });
      if (!type?.active) fail(404, 'ROOM_TYPE_NOT_FOUND', 'Room type unavailable');
      return roomGrid(tx, type, stay);
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  }));
  return router;
};
