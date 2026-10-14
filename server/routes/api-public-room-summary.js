const express = require('express');
const { asyncRoute, fail } = require('../lib/http');
const { publicRoomSummary } = require('../services/public-room-summary');
module.exports = prisma => {
  const router = express.Router();
  router.get('/', asyncRoute(async (req, res) => {
    if (Object.keys(req.query).some(key => !['checkInDate', 'checkOutDate', 'guestCount'].includes(key))) fail(400, 'VALIDATION_ERROR', 'Unexpected query fields');
    if (typeof req.query.guestCount !== 'string' || !/^\d+$/.test(req.query.guestCount)) fail(400, 'INVALID_GUEST_COUNT', 'Guest count must be an integer');
    const data = await publicRoomSummary(prisma, { checkInDate: req.query.checkInDate, checkOutDate: req.query.checkOutDate, guestCount: Number(req.query.guestCount) });
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  }));
  return router;
};
