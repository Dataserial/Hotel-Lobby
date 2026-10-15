// API ส่งคำขอเข้าพักและติดตามสถานะ
const express = require('express');
const { asyncRoute, body, str, int, objectId, page, list, fail } = require('../lib/http');
const { validateStay, validateGuestCount, calculatePrice } = require('../services/booking-validation');

const statuses = ['new', 'read', 'processed', 'rejected'];
// ตรวจว่าเป็นผู้ดูแลหรือพนักงานต้อนรับ
const staff = actor => ['admin', 'receptionist'].includes(actor.role);
const requestInclude = { services: { orderBy: { name: 'asc' } }, member: { select: { id: true, name: true, email: true } } };
// เลือกข้อมูลที่ส่งกลับให้หน้าจอ
const present = row => ({ ...row, member: row.member, services: row.services });
// ตรวจข้อความที่ส่งมาเมื่อมีค่า
const text = (value, field, max) => value === undefined ? undefined : str(value, field, max);

// ตรวจบริการที่เลือกและคำนวณยอดประมาณการ
async function validateServices(prisma, selections, roomType, nights) {
  if (!Array.isArray(selections) || selections.length > 20) fail(400, 'VALIDATION_ERROR', 'Invalid service selections');
  const requested = selections.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['serviceId', 'quantity'].includes(key))) fail(400, 'VALIDATION_ERROR', 'Invalid service selection');
    return { serviceId: objectId(row.serviceId, 'serviceId').toLowerCase(), quantity: int(row.quantity, 'quantity', 1, 20) };
  });
  if (new Set(requested.map(row => row.serviceId)).size !== requested.length) fail(400, 'VALIDATION_ERROR', 'Duplicate service selection');
  const definitions = await prisma.additionalService.findMany({ where: { id: { in: requested.map(row => row.serviceId) }, active: true } });
  if (definitions.length !== requested.length) fail(409, 'SERVICE_UNAVAILABLE', 'One or more selected services are unavailable');
  let total = 0;
  const rows = requested.map(selection => {
    const definition = definitions.find(service => service.id === selection.serviceId);
    if (definition.extraBed && !roomType.supportsExtraBed) fail(409, 'SERVICE_INCOMPATIBLE', 'Extra bed is not supported by this room category');
    if (definition.roomTypeIds.length && !definition.roomTypeIds.includes(roomType.id)) fail(409, 'SERVICE_INCOMPATIBLE', 'Service is not available for this room category');
    if (selection.quantity > definition.maxQuantity) fail(400, 'VALIDATION_ERROR', 'Service quantity exceeds the allowed limit');
    const multiplier = definition.unit === 'per_night' ? nights : 1;
    const estimatedTotal = definition.included || definition.price === null ? 0 : definition.price * selection.quantity * multiplier;
    if (!Number.isSafeInteger(estimatedTotal) || total + estimatedTotal > 2147483647) fail(400, 'INVALID_PRICE', 'Service estimate is too large');
    total += estimatedTotal;
    return { serviceId: definition.id, name: definition.name, quantity: selection.quantity, unit: definition.unit, price: definition.price, included: definition.included, estimatedTotal };
  });
  return { rows, total };
}

module.exports = prisma => {
  const router = express.Router();
  // รับคำขอสร้างหรือทำรายการ /
  router.post('/', asyncRoute(async (req, res) => {
    if (req.actor.role !== 'customer') fail(403, 'FORBIDDEN', 'Only members may submit stay requests');
    body(req.body, ['clientRequestId', 'contactName', 'contactPhone', 'checkInDate', 'checkOutDate', 'guestCount', 'roomTypeId', 'roomId', 'services', 'notes'], ['clientRequestId', 'contactName', 'contactPhone', 'checkInDate', 'checkOutDate', 'guestCount', 'roomTypeId', 'services']);
    const clientRequestId = str(req.body.clientRequestId, 'clientRequestId', 120);
    const existing = await prisma.stayRequest.findUnique({ where: { memberId_clientRequestId: { memberId: req.actor.id, clientRequestId } }, include: requestInclude });
    if (existing) return res.json(present(existing));
    const { nightCount } = validateStay(req.body.checkInDate, req.body.checkOutDate);
    const roomTypeId = objectId(req.body.roomTypeId, 'roomTypeId').toLowerCase();
    const roomType = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
    if (!roomType || !roomType.active) fail(409, 'ROOM_TYPE_UNAVAILABLE', 'Active room category required');
    validateGuestCount(req.body.guestCount, roomType.capacity);
    let room = null;
    if (req.body.roomId !== undefined) {
      room = await prisma.room.findUnique({ where: { id: objectId(req.body.roomId, 'roomId').toLowerCase() } });
      if (!room || !room.active || room.roomTypeId !== roomType.id) fail(409, 'ROOM_UNAVAILABLE', 'Selected room is unavailable for this category');
    }
    const services = await validateServices(prisma, req.body.services, roomType, nightCount);
    const roomPrice = calculatePrice(roomType.basePrice, nightCount);
    const data = { memberId: req.actor.id, clientRequestId, contactName: str(req.body.contactName, 'contactName', 120), contactPhone: str(req.body.contactPhone, 'contactPhone', 40), checkInDate: req.body.checkInDate, checkOutDate: req.body.checkOutDate, guestCount: req.body.guestCount, roomTypeId: roomType.id, roomTypeName: roomType.name, ...(room ? { roomId: room.id, roomNumber: room.number } : {}), roomPricePerNight: roomPrice.pricePerNight, estimatedRoomTotal: roomPrice.totalPrice, estimatedServiceTotal: services.total, ...(req.body.notes === undefined ? {} : { notes: text(req.body.notes, 'notes', 2000) }), services: { create: services.rows } };
    let saved;
    try { saved = await prisma.stayRequest.create({ data, include: requestInclude }); }
    catch (error) {
      if (error.code !== 'P2002') throw error;
      saved = await prisma.stayRequest.findUnique({ where: { memberId_clientRequestId: { memberId: req.actor.id, clientRequestId } }, include: requestInclude });
      if (!saved) throw error;
      return res.json(present(saved));
    }
    const verified = await prisma.stayRequest.findUnique({ where: { id: saved.id }, include: requestInclude });
    if (!verified) fail(500, 'PERSISTENCE_FAILED', 'Stay request could not be verified');
    res.status(201).json(present(verified));
  }));
  // อ่านข้อมูล /
  router.get('/', asyncRoute(async (req, res) => {
    const pagination = page(req.query, ['status']);
    const where = {};
    if (req.query.status) where.status = statuses.includes(req.query.status) ? req.query.status : fail(400, 'VALIDATION_ERROR', 'Invalid request status');
    if (!staff(req.actor)) where.memberId = req.actor.id;
    const result = await list(prisma.stayRequest, where, pagination, { createdAt: 'desc' });
    const items = await prisma.stayRequest.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy: { createdAt: 'desc' }, include: requestInclude });
    const unreadCount = staff(req.actor) ? await prisma.stayRequest.count({ where: { status: 'new' } }) : undefined;
    res.json({ ...result, items: items.map(present), ...(unreadCount === undefined ? {} : { unreadCount }) });
  }));
  // อ่านข้อมูล /:id
  router.get('/:id', asyncRoute(async (req, res) => {
    const item = await prisma.stayRequest.findUnique({ where: { id: objectId(req.params.id) }, include: requestInclude });
    if (!item || (!staff(req.actor) && item.memberId !== req.actor.id)) fail(404, 'NOT_FOUND', 'Stay request not found');
    res.json(present(item));
  }));
  // รับคำขอแก้ไข /:id/status
  router.patch('/:id/status', asyncRoute(async (req, res) => {
    if (!staff(req.actor)) fail(403, 'FORBIDDEN', 'Staff access required');
    body(req.body, ['status'], ['status']);
    if (!statuses.includes(req.body.status)) fail(400, 'VALIDATION_ERROR', 'Invalid request status');
    const item = await prisma.stayRequest.update({ where: { id: objectId(req.params.id) }, data: { status: req.body.status }, include: requestInclude });
    res.json(present(item));
  }));
  return router;
};
