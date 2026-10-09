const express = require('express');
const { asyncRoute, body, str, int, bool, objectId, page, list, fail } = require('../lib/http');
const { role } = require('../lib/auth');

const amenities = (v) => {
  if (!Array.isArray(v) || v.length > 30) fail(400, 'VALIDATION_ERROR', 'Invalid amenities');
  const result = v.map((x) => str(x, 'amenity', 60));
  if (new Set(result.map((x) => x.toLowerCase())).size !== result.length) fail(400, 'VALIDATION_ERROR', 'Duplicate amenity');
  return result;
};
module.exports = (prisma) => {
  const router = express.Router();
  router.get('/', asyncRoute(async (req, res) => {
    const pagination = page(req.query, ['active', 'q']);
    const where = {};
    if (req.query.active !== undefined) where.active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : fail(400, 'VALIDATION_ERROR', 'Invalid active');
    if (req.query.q) where.name = { contains: str(req.query.q, 'q', 80), mode: 'insensitive' };
    res.json(await list(prisma.roomType, where, pagination, { name: 'asc' }));
  }));
  router.get('/:id', asyncRoute(async (req, res) => {
    const item = await prisma.roomType.findUnique({ where: { id: objectId(req.params.id) } });
    if (!item) fail(404, 'NOT_FOUND', 'Room type not found');
    res.json(item);
  }));
  router.use(role('admin'));
  router.post('/', asyncRoute(async (req, res) => {
    body(req.body, ['name', 'capacity', 'basePrice', 'amenities'], ['name', 'capacity', 'basePrice']);
    const name = str(req.body.name, 'name', 80);
    const item = await prisma.roomType.create({ data: {
      name, nameKey: name.toLocaleLowerCase('en-US'), capacity: int(req.body.capacity, 'capacity', 1, 20),
      basePrice: int(req.body.basePrice, 'basePrice', 0, 2147483647), amenities: amenities(req.body.amenities ?? []),
      createdById: req.actor.id, updatedById: req.actor.id,
    } });
    res.status(201).json(item);
  }));
  router.patch('/:id', asyncRoute(async (req, res) => {
    const id = objectId(req.params.id);
    body(req.body, ['name', 'capacity', 'basePrice', 'amenities', 'active']);
    const data = { updatedById: req.actor.id };
    if ('name' in req.body) { data.name = str(req.body.name, 'name', 80); data.nameKey = data.name.toLocaleLowerCase('en-US'); }
    if ('capacity' in req.body) data.capacity = int(req.body.capacity, 'capacity', 1, 20);
    if ('basePrice' in req.body) data.basePrice = int(req.body.basePrice, 'basePrice', 0, 2147483647);
    if ('amenities' in req.body) data.amenities = amenities(req.body.amenities);
    if ('active' in req.body) data.active = bool(req.body.active, 'active');
    const item = await prisma.$transaction(async (tx) => {
      const current = await tx.roomType.findUnique({ where: { id } });
      if (!current) fail(404, 'NOT_FOUND', 'Room type not found');
      if (data.capacity !== undefined && data.capacity < current.capacity) {
        const roomIds = (await tx.room.findMany({ where: { roomTypeId: id }, select: { id: true } })).map((r) => r.id);
        if (roomIds.length && await tx.booking.count({ where: { roomId: { in: roomIds }, status: { in: ['confirmed', 'checked_in'] }, guestCount: { gt: data.capacity } } })) {
          fail(409, 'CAPACITY_CONFLICT', 'Existing booking exceeds the new capacity');
        }
      }
      if (data.active === false && await tx.room.count({ where: { roomTypeId: id, active: true } })) fail(409, 'REFERENCE_CONFLICT', 'Active rooms still use this type');
      return tx.roomType.update({ where: { id }, data });
    });
    res.json(item);
  }));
  router.delete('/:id', asyncRoute(async (req, res) => {
    const id = objectId(req.params.id);
    if (!await prisma.roomType.findUnique({ where: { id } })) fail(404, 'NOT_FOUND', 'Room type not found');
    if (await prisma.room.count({ where: { roomTypeId: id } })) fail(409, 'REFERENCE_CONFLICT', 'Rooms still use this type');
    await prisma.roomType.delete({ where: { id } });
    res.status(204).end();
  }));
  return router;
};
