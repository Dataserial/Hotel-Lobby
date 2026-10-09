const express = require('express');
const { asyncRoute, body, str, int, bool, objectId, page, list, fail } = require('../lib/http');
const { role } = require('../lib/auth');

const present = (room) => ({ ...room, roomNumber: room.number, number: undefined });
const status = (v) => {
  if (!['available', 'maintenance'].includes(v)) fail(400, 'VALIDATION_ERROR', 'Only available or maintenance may be set through room CRUD');
  return v;
};
module.exports = (prisma) => {
  const router = express.Router();
  router.get('/', asyncRoute(async (req, res) => {
    const pagination = page(req.query, ['active', 'status', 'roomTypeId', 'q']);
    const where = {};
    if (req.query.active !== undefined) where.active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : fail(400, 'VALIDATION_ERROR', 'Invalid active');
    if (req.query.status) where.status = ['available', 'maintenance', 'occupied'].includes(req.query.status) ? req.query.status : fail(400, 'VALIDATION_ERROR', 'Invalid status');
    if (req.query.roomTypeId) where.roomTypeId = objectId(req.query.roomTypeId, 'roomTypeId');
    if (req.query.q) where.number = { contains: str(req.query.q, 'q', 20), mode: 'insensitive' };
    const result = await list(prisma.room, where, pagination, { number: 'asc' });
    res.json({ ...result, items: result.items.map(present) });
  }));
  router.get('/:id', asyncRoute(async (req, res) => {
    const room = await prisma.room.findUnique({ where: { id: objectId(req.params.id) }, include: { roomType: true } });
    if (!room) fail(404, 'NOT_FOUND', 'Room not found');
    res.json(present(room));
  }));
  router.use(role('admin'));
  router.post('/', asyncRoute(async (req, res) => {
    body(req.body, ['roomNumber', 'floor', 'roomTypeId', 'status'], ['roomNumber', 'floor', 'roomTypeId']);
    const roomTypeId = objectId(req.body.roomTypeId, 'roomTypeId');
    const type = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
    if (!type || !type.active) fail(409, 'ROOM_TYPE_UNAVAILABLE', 'Active room type required');
    const room = await prisma.room.create({ data: {
      number: str(req.body.roomNumber, 'roomNumber', 20), floor: int(req.body.floor, 'floor', -20, 300),
      roomTypeId, status: req.body.status ? status(req.body.status) : 'available', active: true,
      createdById: req.actor.id, updatedById: req.actor.id,
    } });
    res.status(201).json(present(room));
  }));
  router.patch('/:id', asyncRoute(async (req, res) => {
    const id = objectId(req.params.id);
    body(req.body, ['roomNumber', 'floor', 'roomTypeId', 'status', 'active']);
    const data = { updatedById: req.actor.id };
    if ('roomNumber' in req.body) data.number = str(req.body.roomNumber, 'roomNumber', 20);
    if ('floor' in req.body) data.floor = int(req.body.floor, 'floor', -20, 300);
    if ('roomTypeId' in req.body) data.roomTypeId = objectId(req.body.roomTypeId, 'roomTypeId');
    if ('status' in req.body) data.status = status(req.body.status);
    if ('active' in req.body) data.active = bool(req.body.active, 'active');
    const room = await prisma.$transaction(async (tx) => {
      const current = await tx.room.findUnique({ where: { id }, include: { roomType: true } });
      if (!current) fail(404, 'NOT_FOUND', 'Room not found');
      if (current.status === 'occupied' && (data.status || data.active === false || data.roomTypeId)) fail(409, 'ROOM_OCCUPIED', 'Occupied room must use check-out operation');
      if (data.roomTypeId) {
        const type = await tx.roomType.findUnique({ where: { id: data.roomTypeId } });
        if (!type || !type.active) fail(409, 'ROOM_TYPE_UNAVAILABLE', 'Active room type required');
        if (await tx.booking.count({ where: { roomId: id, status: { in: ['confirmed', 'checked_in'] }, guestCount: { gt: type.capacity } } })) fail(409, 'CAPACITY_CONFLICT', 'Existing booking exceeds new capacity');
      }
      if (data.active === false || data.status === 'maintenance') {
        if (await tx.booking.count({ where: { roomId: id, status: { in: ['confirmed', 'checked_in'] } } })) fail(409, 'BOOKING_CONFLICT', 'Active bookings use this room');
      }
      return tx.room.update({ where: { id }, data });
    });
    res.json(present(room));
  }));
  router.delete('/:id', asyncRoute(async (req, res) => {
    const id = objectId(req.params.id);
    if (!await prisma.room.findUnique({ where: { id } })) fail(404, 'NOT_FOUND', 'Room not found');
    if (await prisma.booking.count({ where: { roomId: id } }) || await prisma.roomNightClaim.count({ where: { roomId: id } })) fail(409, 'REFERENCE_CONFLICT', 'Room has history');
    await prisma.room.delete({ where: { id } });
    res.status(204).end();
  }));
  return router;
};
