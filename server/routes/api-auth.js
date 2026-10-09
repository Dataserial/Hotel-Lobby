const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { asyncRoute, body, email, str, fail } = require('../lib/http');
const { publicUser, hashToken, verifyPassword, requireAuth } = require('../lib/auth');

module.exports = (prisma) => {
  const router = express.Router();
  router.post('/login', asyncRoute(async (req, res) => {
    body(req.body, ['email', 'password'], ['email', 'password']);
    const address = email(req.body.email);
    const password = str(req.body.password, 'password', 1024);
    const user = await prisma.user.findUnique({ where: { email: address } });
    // Run a hash comparison even for unknown users to reduce account enumeration.
    const fallback = '$2b$10$u0I2aDNpvxAWcQIlQ5b4W.0d6QOvVyXP8eLnhQq0fD5CqBA68kAAW';
    const valid = await verifyPassword(password, user?.passwordHash || fallback);
    if (!user || !user.active || !valid) fail(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.session.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) } });
    res.json({ token, tokenType: 'Bearer', expiresIn: 28800, user: publicUser(user) });
  }));
  router.use(requireAuth(prisma));
  router.get('/me', (req, res) => res.json({ user: req.actor }));
  router.post('/logout', asyncRoute(async (req, res) => {
    await prisma.session.delete({ where: { id: req.session.id } });
    res.status(204).end();
  }));
  return router;
};
