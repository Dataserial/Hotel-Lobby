const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { fail, asyncRoute } = require('./http');

const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, createdAt: user.createdAt, updatedAt: user.updatedAt });
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const verifyPassword = (plain, hash) => hash.startsWith('$2') && bcrypt.compare(plain, hash);

function requireAuth(prisma) {
  return asyncRoute(async (req, _res, next) => {
    const match = /^Bearer ([A-Za-z0-9_-]{40,})$/.exec(req.get('authorization') || '');
    if (!match) fail(401, 'UNAUTHENTICATED', 'Authentication required');
    const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(match[1]) }, include: { user: true } });
    if (!session || session.expiresAt <= new Date() || !session.user.active) fail(401, 'UNAUTHENTICATED', 'Session expired or revoked');
    req.actor = publicUser(session.user);
    req.session = session;
    next();
  });
}
const role = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.actor.role)) fail(403, 'FORBIDDEN', 'Insufficient role');
  next();
};
module.exports = { publicUser, hashToken, verifyPassword, requireAuth, role };
