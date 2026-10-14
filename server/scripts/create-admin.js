const bcrypt = require('bcryptjs');
const { email } = require('../lib/http');

async function createAdmin(prisma, env) {
  const address = email(env.ADMIN_EMAIL);
  const password = env.ADMIN_PASSWORD || '';
  if (password !== password.trim() || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD must contain at least 12 characters, at most 72 UTF-8 bytes, and no leading/trailing whitespace');
  }
  const existing = await prisma.user.findUnique({ where: { email: address } });
  if (existing) {
    if (existing.role === 'admin' && existing.active && await bcrypt.compare(password, existing.passwordHash)) {
      return 'Admin already exists and the supplied password matches.';
    }
    throw new Error('That email already exists; no account or password was changed. Use the existing admin user management flow.');
  }
  await prisma.user.create({ data: {
    email: address, name: 'Administrator', role: 'admin', active: true,
    passwordHash: await bcrypt.hash(password, 12),
  } });
  return 'Admin created. Sign in using ADMIN_EMAIL and ADMIN_PASSWORD.';
}

async function main() {
  require('dotenv').config({ quiet: true });
  let url;
  try { url = new URL(process.env.DATABASE_URL); } catch { throw new Error('Set a valid DATABASE_URL'); }
  if (!['mongodb:', 'mongodb+srv:'].includes(url.protocol) || !/^\/[^/]+$/.test(url.pathname)) {
    throw new Error('DATABASE_URL must specify a MongoDB database name');
  }
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try { console.log(await createAdmin(prisma, process.env)); }
  finally { await prisma.$disconnect(); }
}

if (require.main === module) main().catch((error) => {
  // Never print database errors: they can include connection details or values.
  console.error(error.name === 'Error' ? error.message : 'Admin creation failed. Check the database connection, indexes, and ADMIN_EMAIL.');
  process.exitCode = 1;
});

module.exports = { createAdmin };
