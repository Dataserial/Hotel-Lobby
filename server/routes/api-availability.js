const express = require('express');
const { role } = require('../lib/auth');
const { asyncRoute, page, fail } = require('../lib/http');
const { findAvailableRooms } = require('../services/availability-service');

module.exports = (prisma) => {
  const router = express.Router();
  router.use(role('admin', 'receptionist'));
  router.get('/', asyncRoute(async (req, res) => {
    const pagination = page(req.query, ['checkInDate', 'checkOutDate', 'guestCount']);
    const count = req.query.guestCount;
    if (typeof count !== 'string' || !/^\d+$/.test(count)) {
      fail(400, 'INVALID_GUEST_COUNT', 'Guest count must be an integer.');
    }
    const rooms = await findAvailableRooms(prisma, {
      checkInDate: req.query.checkInDate, checkOutDate: req.query.checkOutDate,
      guestCount: Number(count),
    });
    res.json({
      items: rooms.slice(pagination.skip, pagination.skip + pagination.take),
      page: pagination.page, limit: pagination.limit, total: rooms.length,
    });
  }));
  return router;
};
