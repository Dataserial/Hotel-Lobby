const express = require('express');
const { asyncRoute, body, str, int, bool, objectId, page, list, fail } = require('../lib/http');
const { role } = require('../lib/auth');

const units = ['per_night', 'per_set', 'per_stay'];
const unit = value => units.includes(value) ? value : fail(400, 'VALIDATION_ERROR', 'Invalid pricing unit');
const ids = value => {
  if (!Array.isArray(value) || value.length > 50) fail(400, 'VALIDATION_ERROR', 'Invalid room type list');
  return [...new Set(value.map(id => objectId(id, 'roomTypeId').toLowerCase()))];
};
const price = value => value === null ? null : int(value, 'price', 0, 2147483647);
const present = service => ({ id: service.id, name: service.name, unit: service.unit, price: service.price, included: service.included, extraBed: service.extraBed, roomTypeIds: service.roomTypeIds, maxQuantity: service.maxQuantity, active: service.active, createdAt: service.createdAt, updatedAt: service.updatedAt });

async function assertRoomTypes(tx, roomTypeIds) {
  if (roomTypeIds.length && await tx.roomType.count({ where: { id: { in: roomTypeIds } } }) !== roomTypeIds.length) {
    fail(400, 'INVALID_REFERENCE', 'One or more room types do not exist');
  }
}

module.exports = (prisma, { publicAccess = false } = {}) => {
  const router = express.Router();
  router.get('/', asyncRoute(async (req, res) => {
    const pagination = page(req.query, publicAccess ? ['roomTypeId'] : ['roomTypeId', 'active', 'q']);
    const where = publicAccess ? { active: true } : {};
    if (req.query.roomTypeId) {
      const roomTypeId = objectId(req.query.roomTypeId, 'roomTypeId').toLowerCase();
      where.OR = [{ roomTypeIds: { isEmpty: true } }, { roomTypeIds: { has: roomTypeId } }];
    }
    if (!publicAccess && req.query.active !== undefined) where.active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : fail(400, 'VALIDATION_ERROR', 'Invalid active');
    if (!publicAccess && req.query.q) where.name = { contains: str(req.query.q, 'q', 80), mode: 'insensitive' };
    const result = await list(prisma.additionalService, where, pagination, { name: 'asc' });
    res.json({ ...result, items: result.items.map(present) });
  }));
  if (publicAccess) return router;
  router.use(role('admin'));
  router.post('/', asyncRoute(async (req, res) => {
    body(req.body, ['name', 'unit', 'price', 'included', 'extraBed', 'roomTypeIds', 'maxQuantity'], ['name', 'unit']);
    const name = str(req.body.name, 'name', 80);
    const included = req.body.included === undefined ? false : bool(req.body.included, 'included');
    const data = { name, nameKey: name.toLocaleLowerCase('en-US'), unit: unit(req.body.unit), price: req.body.price === undefined ? null : price(req.body.price), included, extraBed: req.body.extraBed === undefined ? false : bool(req.body.extraBed, 'extraBed'), roomTypeIds: req.body.roomTypeIds === undefined ? [] : ids(req.body.roomTypeIds), maxQuantity: req.body.maxQuantity === undefined ? 1 : int(req.body.maxQuantity, 'maxQuantity', 1, 20), createdById: req.actor.id, updatedById: req.actor.id };
    const item = await prisma.$transaction(async tx => {
      await assertRoomTypes(tx, data.roomTypeIds);
      return tx.additionalService.create({ data });
    });
    res.status(201).json(present(item));
  }));
  router.patch('/:id', asyncRoute(async (req, res) => {
    body(req.body, ['name', 'unit', 'price', 'included', 'extraBed', 'roomTypeIds', 'maxQuantity', 'active']);
    const data = { updatedById: req.actor.id };
    if ('name' in req.body) { data.name = str(req.body.name, 'name', 80); data.nameKey = data.name.toLocaleLowerCase('en-US'); }
    if ('unit' in req.body) data.unit = unit(req.body.unit);
    if ('price' in req.body) data.price = price(req.body.price);
    if ('included' in req.body) data.included = bool(req.body.included, 'included');
    if ('extraBed' in req.body) data.extraBed = bool(req.body.extraBed, 'extraBed');
    if ('roomTypeIds' in req.body) data.roomTypeIds = ids(req.body.roomTypeIds);
    if ('maxQuantity' in req.body) data.maxQuantity = int(req.body.maxQuantity, 'maxQuantity', 1, 20);
    if ('active' in req.body) data.active = bool(req.body.active, 'active');
    const id = objectId(req.params.id);
    const item = await prisma.$transaction(async tx => {
      if (data.roomTypeIds) await assertRoomTypes(tx, data.roomTypeIds);
      return tx.additionalService.update({ where: { id }, data });
    });
    res.json(present(item));
  }));
  return router;
};
