const express = require('express');
const { asyncRoute, body, str, email, bool, objectId, page, list, fail } = require('../lib/http');

const phone = (v) => {
  const value = str(v, 'phone', 25).replace(/[\s()-]/g, '');
  if (!/^\+?\d{8,15}$/.test(value)) fail(400, 'VALIDATION_ERROR', 'Invalid phone');
  return value;
};
const document = (v) => str(v, 'documentNo', 60);
const key = (v) => v.replace(/\s/g, '').toUpperCase();
const present = (guest, actor, detail = false) => {
  const { documentNo, documentNoKey, ...safe } = guest;
  return actor.role === 'admin' && detail ? { ...safe, documentNo } : { ...safe, documentNoMasked: documentNo ? `***${documentNo.slice(-4)}` : null };
};
module.exports = (prisma) => {
  const router = express.Router();
  router.get('/', asyncRoute(async (req, res) => {
    const pagination = page(req.query, ['active', 'q', 'documentNo']);
    const where = {};
    if (req.query.active !== undefined) where.active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : fail(400, 'VALIDATION_ERROR', 'Invalid active');
    if (req.query.q) {
      const q = str(req.query.q, 'q', 160);
      where.OR = [{ fullName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }];
    }
    if (req.query.documentNo) where.documentNoKey = key(document(req.query.documentNo));
    const result = await list(prisma.guest, where, pagination, { createdAt: 'desc' });
    res.json({ ...result, items: result.items.map((g) => present(g, req.actor)) });
  }));
  router.get('/:id', asyncRoute(async (req, res) => {
    const guest = await prisma.guest.findUnique({ where: { id: objectId(req.params.id) } });
    if (!guest) fail(404, 'NOT_FOUND', 'Guest not found');
    res.json(present(guest, req.actor, true));
  }));
  router.post('/', asyncRoute(async (req, res) => {
    body(req.body, ['fullName', 'phone', 'email', 'documentNo'], ['fullName', 'phone', 'documentNo']);
    const documentNo = document(req.body.documentNo);
    const guest = await prisma.guest.create({ data: {
      fullName: str(req.body.fullName, 'fullName', 160), phone: phone(req.body.phone),
      email: req.body.email == null ? null : email(req.body.email), documentNo, documentNoKey: key(documentNo),
      active: true, createdById: req.actor.id, updatedById: req.actor.id,
    } });
    res.status(201).json(present(guest, req.actor, true));
  }));
  router.patch('/:id', asyncRoute(async (req, res) => {
    const id = objectId(req.params.id);
    body(req.body, ['fullName', 'phone', 'email', 'documentNo', 'active']);
    const data = { updatedById: req.actor.id };
    if ('fullName' in req.body) data.fullName = str(req.body.fullName, 'fullName', 160);
    if ('phone' in req.body) data.phone = phone(req.body.phone);
    if ('email' in req.body) data.email = req.body.email == null ? null : email(req.body.email);
    if ('documentNo' in req.body) { data.documentNo = document(req.body.documentNo); data.documentNoKey = key(data.documentNo); }
    if ('active' in req.body) data.active = bool(req.body.active, 'active');
    const guest = await prisma.guest.update({ where: { id }, data });
    res.json(present(guest, req.actor, true));
  }));
  router.delete('/:id', asyncRoute(async (req, res) => {
    const id = objectId(req.params.id);
    const guest = await prisma.guest.findUnique({ where: { id } });
    if (!guest) fail(404, 'NOT_FOUND', 'Guest not found');
    if (await prisma.booking.count({ where: { guestId: id } })) {
      const archived = await prisma.guest.update({ where: { id }, data: { active: false, updatedById: req.actor.id } });
      res.json(present(archived, req.actor, true));
    } else {
      await prisma.guest.delete({ where: { id } });
      res.status(204).end();
    }
  }));
  return router;
};
