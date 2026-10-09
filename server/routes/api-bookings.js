const express = require('express');
const { role } = require('../lib/auth');
const { asyncRoute, body, page, list, objectId, fail } = require('../lib/http');
const { parseHotelDate } = require('../services/booking-validation');
const { createBooking, updateBooking, cancelBooking } = require('../services/booking-service');

const writable = ['guestId', 'roomId', 'guestCount', 'checkInDate', 'checkOutDate'];
const select = Object.fromEntries([
  'id', ...writable, 'status', 'pricePerNight', 'totalPrice', 'actualCheckInAt',
  'actualCheckOutAt', 'cancelledAt', 'createdAt', 'updatedAt', 'createdById', 'updatedById',
].map((key) => [key, true]));
const present = (booking) => Object.fromEntries(Object.keys(select).map((key) => [key, booking[key]]));
const noQuery = (req) => {
  if (Object.keys(req.query).length) fail(400, 'VALIDATION_ERROR', 'Unexpected query field');
};

module.exports = (prisma) => {
  const router = express.Router();
  router.use(role('admin', 'receptionist'));
  router.get('/', asyncRoute(async (req, res) => {
    const pagination = page(req.query, ['status', 'guestId', 'roomId', 'checkInFrom', 'checkInTo', 'checkOutFrom', 'checkOutTo']);
    const where = {};
    if (req.query.status !== undefined) {
      if (!['confirmed', 'checked_in', 'checked_out', 'cancelled'].includes(req.query.status)) {
        fail(400, 'VALIDATION_ERROR', 'Invalid status');
      }
      where.status = req.query.status;
    }
    for (const field of ['guestId', 'roomId']) {
      if (req.query[field] !== undefined) where[field] = objectId(req.query[field], field);
    }
    for (const [field, operator] of [['checkInFrom', 'gte'], ['checkInTo', 'lte']]) {
      if (req.query[field] !== undefined) {
        parseHotelDate(req.query[field]);
        where.checkInDate = { ...where.checkInDate, [operator]: req.query[field] };
      }
    }
    if (where.checkInDate?.gte && where.checkInDate?.lte && where.checkInDate.gte > where.checkInDate.lte) {
      fail(400, 'INVALID_DATE_RANGE', 'checkInFrom must not exceed checkInTo');
    }
    for (const [field, operator] of [['checkOutFrom', 'gte'], ['checkOutTo', 'lte']]) {
      if (req.query[field] !== undefined) {
        parseHotelDate(req.query[field]);
        where.checkOutDate = { ...where.checkOutDate, [operator]: req.query[field] };
      }
    }
    if (where.checkOutDate?.gte && where.checkOutDate?.lte && where.checkOutDate.gte > where.checkOutDate.lte) {
      fail(400, 'INVALID_DATE_RANGE', 'checkOutFrom must not exceed checkOutTo');
    }
    res.json(await list(prisma.booking, where, pagination, [{ createdAt: 'desc' }, { id: 'desc' }], select));
  }));
  router.get('/:id', asyncRoute(async (req, res) => {
    noQuery(req);
    const booking = await prisma.booking.findUnique({ where: { id: objectId(req.params.id) }, select });
    if (!booking) fail(404, 'BOOKING_NOT_FOUND', 'Booking does not exist.');
    res.json(booking);
  }));
  router.post('/', asyncRoute(async (req, res) => {
    noQuery(req);
    body(req.body, writable, writable);
    res.status(201).json(present(await createBooking(prisma, req.body, req.actor.id)));
  }));
  router.patch('/:id', asyncRoute(async (req, res) => {
    noQuery(req);
    body(req.body, writable);
    res.json(present(await updateBooking(prisma, req.params.id, req.body, req.actor.id)));
  }));
  router.post('/:id/cancel', asyncRoute(async (req, res) => {
    noQuery(req);
    if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) {
      fail(400, 'VALIDATION_ERROR', 'Cancellation does not accept fields');
    }
    res.json(present(await cancelBooking(prisma, req.params.id, req.actor.id)));
  }));
  return router;
};
module.exports.present = present;
