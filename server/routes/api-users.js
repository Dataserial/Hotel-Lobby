// API จัดการผู้ใช้โดยรักษาบัญชีผู้ดูแลที่ใช้งานได้
const express = require('express');
const bcrypt = require('bcryptjs');
const { asyncRoute, body, str, email, bool, objectId, page, list, fail } = require('../lib/http');
const { role, publicUser } = require('../lib/auth');

const userSelect = { id: true, name: true, email: true, role: true, active: true, createdAt: true, updatedAt: true };
const { password } = require('../lib/password');
// ตรวจบทบาทผู้ใช้ที่ระบบรองรับ
const userRole = (v) => {
  if (!['admin', 'receptionist', 'customer'].includes(v)) fail(400, 'VALIDATION_ERROR', 'Invalid role');
  return v;
};

module.exports = (prisma) => {
  const router = express.Router();
  // กำหนดเงื่อนไขร่วมของเส้นทาง
  router.use(role('admin'));
  // อ่านข้อมูล /
  router.get('/', asyncRoute(async (req, res) => {
    const pagination = page(req.query, ['role', 'active', 'q']);
    const where = {};
    if (req.query.role) where.role = userRole(req.query.role);
    if (req.query.active !== undefined) where.active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : fail(400, 'VALIDATION_ERROR', 'Invalid active');
    if (req.query.q) where.OR = [{ name: { contains: str(req.query.q, 'q', 120), mode: 'insensitive' } }, { email: { contains: str(req.query.q, 'q', 120), mode: 'insensitive' } }];
    res.json(await list(prisma.user, where, pagination, { createdAt: 'desc' }, userSelect));
  }));
  // อ่านข้อมูล /:id
  router.get('/:id', asyncRoute(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: objectId(req.params.id) }, select: userSelect });
    if (!user) fail(404, 'NOT_FOUND', 'User not found');
    res.json(user);
  }));
  // รับคำขอสร้างหรือทำรายการ /
  router.post('/', asyncRoute(async (req, res) => {
    body(req.body, ['name', 'email', 'password', 'role'], ['name', 'email', 'password', 'role']);
    const user = await prisma.user.create({ data: {
      name: str(req.body.name, 'name', 120), email: email(req.body.email),
      passwordHash: await bcrypt.hash(password(req.body.password), 12), role: userRole(req.body.role),
      createdById: req.actor.id, updatedById: req.actor.id,
    }, select: userSelect });
    res.status(201).json(user);
  }));
  // รับคำขอแก้ไข /:id
  router.patch('/:id', asyncRoute(async (req, res) => {
    const id = objectId(req.params.id);
    body(req.body, ['name', 'email', 'password', 'role', 'active']);
    const data = { updatedById: req.actor.id };
    if ('name' in req.body) data.name = str(req.body.name, 'name', 120);
    if ('email' in req.body) data.email = email(req.body.email);
    if ('password' in req.body) data.passwordHash = await bcrypt.hash(password(req.body.password), 12);
    if ('role' in req.body) data.role = userRole(req.body.role);
    if ('active' in req.body) data.active = bool(req.body.active, 'active');
    const user = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id } });
      if (!current) fail(404, 'NOT_FOUND', 'User not found');
      if (current.role === 'admin' && current.active && ((data.role !== undefined && data.role !== 'admin') || data.active === false)) {
        if (id === req.actor.id) fail(409, 'SELF_ADMIN_CHANGE', 'Cannot deactivate or demote yourself');
        // เขียนจุดร่วมเพื่อให้ตรวจพบการแก้ผู้ดูแลพร้อมกัน
        await tx.adminGuard.upsert({ where: { id: 'active-admins' }, create: { id: 'active-admins', version: 1 }, update: { version: { increment: 1 } } });
        if (await tx.user.count({ where: { role: 'admin', active: true } }) <= 1) fail(409, 'LAST_ADMIN', 'Cannot remove the last admin');
      }
      const updated = await tx.user.update({ where: { id }, data, select: userSelect });
      if (data.passwordHash) await tx.session.deleteMany({ where: { userId: id } });
      return updated;
    });
    res.json(user);
  }));
  // รับคำขอสร้างหรือทำรายการ /:id/deactivate
  router.post('/:id/deactivate', asyncRoute(async (req, res) => {
    // ใช้ตัวป้องกันเดียวกับ PATCH และอ่านผู้ทำรายการจาก session เท่านั้น
    req.body = { active: false };
    const id = objectId(req.params.id);
    const user = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id } });
      if (!current) fail(404, 'NOT_FOUND', 'User not found');
      if (current.role === 'admin' && current.active) {
        if (id === req.actor.id) fail(409, 'SELF_ADMIN_CHANGE', 'Cannot deactivate yourself');
        await tx.adminGuard.upsert({ where: { id: 'active-admins' }, create: { id: 'active-admins', version: 1 }, update: { version: { increment: 1 } } });
        if (await tx.user.count({ where: { role: 'admin', active: true } }) <= 1) fail(409, 'LAST_ADMIN', 'Cannot remove the last admin');
      }
      return tx.user.update({ where: { id }, data: { active: false, updatedById: req.actor.id }, select: userSelect });
    });
    res.json(user);
  }));
  return router;
};
