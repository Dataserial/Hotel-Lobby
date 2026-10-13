const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { asyncRoute, body, email, str, fail } = require('../lib/http');
const { publicUser, hashToken, verifyPassword, requireAuth, role } = require('../lib/auth');
const { password: credential } = require('../lib/password');

module.exports = (prisma) => {
  const router = express.Router();
  router.post('/register', asyncRoute(async (req, res) => {
    body(req.body, ['name', 'email', 'password'], ['name', 'email', 'password']);
    const user = await prisma.user.create({ data: {
      name: str(req.body.name, 'name', 120), email: email(req.body.email),
      passwordHash: await bcrypt.hash(credential(req.body.password), 12), role: 'customer', active: true,
    } });
    res.status(201).json({ user: publicUser(user) });
  }));
  router.post('/login', asyncRoute(async (req, res) => {
    body(req.body, ['email', 'password'], ['email', 'password']);
    const address = email(req.body.email);
    const password = credential(req.body.password, { setting: false });
    const user = await prisma.user.findUnique({ where: { email: address } });
    // Run a hash comparison even for unknown users to reduce account enumeration.
    const fallback = '$2b$10$u0I2aDNpvxAWcQIlQ5b4W.0d6QOvVyXP8eLnhQq0fD5CqBA68kAAW';
    const valid = await verifyPassword(password, user?.passwordHash || fallback);
    if (!user || !user.active || !valid) fail(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current?.active || current.passwordHash !== user.passwordHash) fail(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
      // Serialize credential changes with session issuance on the same user document.
      await tx.user.update({ where: { id: user.id }, data: { updatedAt: new Date() } });
      await tx.session.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) } });
    });
    res.json({ token, tokenType: 'Bearer', expiresIn: 28800, user: publicUser(user) });
  }));
  router.use(requireAuth(prisma));
  router.get('/me', (req, res) => res.json({ user: req.actor }));
  router.patch('/profile', role('customer'), asyncRoute(async (req, res) => {
    body(req.body, ['name', 'email']);
    const data = { updatedById: req.actor.id };
    if ('name' in req.body) data.name = str(req.body.name, 'name', 120);
    if ('email' in req.body) data.email = email(req.body.email);
    const user = await prisma.user.update({ where: { id: req.actor.id }, data });
    res.json({ user: publicUser(user) });
  }));
  router.post('/logout', asyncRoute(async (req, res) => {
    await prisma.session.delete({ where: { id: req.session.id } });
    res.status(204).end();
  }));
  return router;
};
