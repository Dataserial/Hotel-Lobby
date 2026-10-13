const express = require('express');
const crypto = require('crypto');
const { asyncRoute, body, str, objectId, fail, page } = require('../lib/http');
const { role } = require('../lib/auth');
const { validateStay, validateGuestCount, calculatePrice } = require('../services/booking-validation');
const { roomBookable } = require('../services/room-bookability');
const { operationTransaction } = require('../services/operation-transaction');
const { hotelToday } = require('../services/stay-service');

const present = booking => ({ id: booking.id, roomNumber: booking.room.number, roomType: booking.room.roomType?.name || '—',
  checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate, guestCount: booking.guestCount,
  pricePerNight: booking.pricePerNight, totalPrice: booking.totalPrice, status: booking.status,
  paymentStatus: booking.payment?.status || 'pending' });

module.exports = prisma => {
  const router = express.Router();
  router.use(role('customer'));
  router.get('/', asyncRoute(async (req, res) => {
    const pagination = page(req.query);
    const where = { customerId: req.actor.id };
    const [total, rows] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({ where, include: { room: { include: { roomType: true } }, payment: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: pagination.skip, take: pagination.take }),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: rows.map(present), total, page: pagination.page, limit: pagination.limit });
  }));
  router.post('/', asyncRoute(async (req, res) => {
    body(req.body, ['roomId', 'checkInDate', 'checkOutDate', 'phone', 'documentNo', 'expectedPricePerNight'],
      ['roomId', 'checkInDate', 'checkOutDate', 'phone', 'documentNo', 'expectedPricePerNight']);
    const roomId = objectId(req.body.roomId, 'roomId');
    const stay = validateStay(req.body.checkInDate, req.body.checkOutDate);
    if (stay.checkInDate < hotelToday(new Date())) fail(400, 'INVALID_DATE_RANGE', 'Check-in date is in the past');
    const phone = str(req.body.phone, 'phone', 30).replace(/[\s()-]/g, '');
    if (!/^\+?\d{8,15}$/.test(phone)) fail(400, 'VALIDATION_ERROR', 'Invalid phone number');
    const documentNo = str(req.body.documentNo, 'documentNo', 64);
    const documentNoKey = documentNo.toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9-]{5,64}$/.test(documentNoKey)) fail(400, 'VALIDATION_ERROR', 'Invalid document number');
    if (!Number.isSafeInteger(req.body.expectedPricePerNight) || req.body.expectedPricePerNight < 0) fail(400, 'VALIDATION_ERROR', 'Invalid expected price');
    const rawKey = req.get('Idempotency-Key');
    if (!rawKey || !/^[A-Za-z0-9_-]{16,128}$/.test(rawKey)) fail(400, 'VALIDATION_ERROR', 'Idempotency-Key required');
    const key = crypto.createHash('sha256').update(`${req.actor.id}:${rawKey}`).digest('hex');
    const hash = crypto.createHash('sha256').update(JSON.stringify([roomId, stay.checkInDate, stay.checkOutDate, phone, documentNoKey, req.body.expectedPricePerNight])).digest('hex');
    const existing = await prisma.customerBookingRequest.findUnique({ where: { key } });
    if (existing) {
      if (existing.customerId !== req.actor.id || existing.hash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Request key reused with different details');
      const prior = await prisma.booking.findUnique({ where: { id: existing.bookingId }, include: { room: { include: { roomType: true } }, payment: true } });
      return res.json(present(prior));
    }
    let booking;
    try {
      booking = await operationTransaction(prisma, async tx => {
        const replay = await tx.customerBookingRequest.findUnique({ where: { key } });
        if (replay) {
          if (replay.customerId !== req.actor.id || replay.hash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Request key reused with different details');
          return tx.booking.findUnique({ where: { id: replay.bookingId } });
        }
        const actor = await tx.user.findUnique({ where: { id: req.actor.id } });
        if (!actor?.active || actor.role !== 'customer') fail(403, 'FORBIDDEN', 'Customer account required');
        const room = await tx.room.findUnique({ where: { id: roomId }, include: { roomType: true } });
        if (!room || !await roomBookable(tx, room, stay.checkInDate)) fail(409, 'ROOM_UNAVAILABLE', 'Room unavailable');
        if (room.roomType.basePrice !== req.body.expectedPricePerNight) fail(409, 'PRICE_CHANGED', 'Price changed; review and confirm again');
        validateGuestCount(room.roomType.capacity);
        const price = calculatePrice(room.roomType.basePrice, stay.nightCount);
        let guest = await tx.guest.findUnique({ where: { documentNoKey } });
        if (guest && (guest.customerId !== req.actor.id || guest.active === false)) fail(409, 'DOCUMENT_REVIEW_REQUIRED', 'Contact hotel to verify existing guest document');
        if (!guest) guest = await tx.guest.create({ data: { fullName: actor.name, email: actor.email, phone,
          documentNo, documentNoKey, customerId: actor.id, createdById: actor.id, updatedById: actor.id } });
        else guest = await tx.guest.update({ where: { id: guest.id }, data: { fullName: actor.name, email: actor.email, phone, updatedById: actor.id } });
        const created = await tx.booking.create({ data: { guestId: guest.id, roomId: room.id, guestCount: room.roomType.capacity,
          checkInDate: stay.checkInDate, checkOutDate: stay.checkOutDate, status: 'confirmed', ...price,
          customerId: actor.id,
          createdById: actor.id, updatedById: actor.id } });
        try { await tx.roomNightClaim.createMany({ data: stay.nights.map(night => ({ bookingId: created.id, roomId, night })) }); }
        catch (error) { if (error.code === 'P2002') fail(409, 'ROOM_UNAVAILABLE', 'Room booked by someone else'); throw error; }
        await tx.payment.create({ data: { bookingId: created.id, amount: price.totalPrice,
          paidAmount: 0, refundedAmount: 0, ledgerReady: true, status: 'pending', recordedById: actor.id } });
        await tx.customerBookingRequest.create({ data: { key, hash, customerId: actor.id, bookingId: created.id } });
        return created;
      });
    } catch (error) {
      // A concurrent identical request may have won the night claim first.
      const replay = await prisma.customerBookingRequest.findUnique({ where: { key } });
      if (replay) {
        if (replay.customerId !== req.actor.id || replay.hash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Request key reused with different details');
        const prior = await prisma.booking.findUnique({ where: { id: replay.bookingId }, include: { room: { include: { roomType: true } }, payment: true } });
        return res.json(present(prior));
      }
      if (error.code === 'P2002') {
        const retry = await prisma.customerBookingRequest.findUnique({ where: { key } });
        if (retry?.customerId === req.actor.id && retry.hash === hash) {
          const prior = await prisma.booking.findUnique({ where: { id: retry.bookingId }, include: { room: { include: { roomType: true } }, payment: true } });
          return res.json(present(prior));
        }
        fail(409, 'DOCUMENT_REVIEW_REQUIRED', 'Please contact hotel to verify booking details');
      }
      throw error;
    }
    const created = await prisma.booking.findUnique({ where: { id: booking.id }, include: { room: { include: { roomType: true } }, payment: true } });
    res.status(201).json(present(created));
  }));
  return router;
};
