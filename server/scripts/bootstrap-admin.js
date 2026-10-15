// ตั้งค่าผู้ดูแลเริ่มต้นตามข้อมูลที่กำหนด
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { email, str } = require('../lib/http');
const { password } = require('../lib/password');
const { publicUser } = require('../lib/auth');

function config(env, args) {
  let url;
  try { url = new URL(env.DATABASE_URL || ''); } catch { throw new Error('Set a valid DATABASE_URL'); }
  const database = url.pathname.slice(1);
  if (!['mongodb:', 'mongodb+srv:'].includes(url.protocol) || !database || args.length !== 3 || args[0] !== '--database' || args[1] !== database || args[2] !== '--initial-admin') {
    throw new Error('Use --database <exact DATABASE_URL database> --initial-admin');
  }
  return { database, email: email(env.BOOTSTRAP_ADMIN_EMAIL), password: password(env.BOOTSTRAP_ADMIN_PASSWORD), name: str(env.BOOTSTRAP_ADMIN_NAME || 'Administrator', 'name', 120) };
}

async function bootstrapAdmin(prisma, input) {
  return prisma.$transaction(async tx => {
    await tx.adminGuard.upsert({ where: { id: 'active-admins' }, create: { id: 'active-admins', version: 1 }, update: { version: { increment: 1 } } });
    const current = await tx.user.findUnique({ where: { email: input.email } });
    if (current) {
      if (current.role !== 'admin' || !current.active || !await bcrypt.compare(input.password, current.passwordHash)) throw new Error('Existing account cannot be reset by initial-admin bootstrap');
      return { created: false, user: publicUser(current) };
    }
    if (await tx.user.count()) throw new Error('Initial-admin bootstrap only accepts a database without existing users');
    const user = await tx.user.create({ data: { name: input.name, email: input.email, role: 'admin', active: true, passwordHash: await bcrypt.hash(password(input.password), 12) } });
    return { created: true, user: publicUser(user) };
  });
}

// เริ่มขั้นตอนหลัก: ตั้งค่าผู้ดูแลเริ่มต้นตามข้อมูลที่กำหนด
async function main() {
  const input = config(process.env, process.argv.slice(2));
  const prisma = new PrismaClient();
  try { const result = await bootstrapAdmin(prisma, input); console.log(`Initial administrator ${result.created ? 'created' : 'already verified'} in ${input.database}; password was not printed`); }
  finally { await prisma.$disconnect(); }
}
if (require.main === module) main().catch(() => { console.error('Initial administrator setup failed. Check the exact database, credential policy and existing users. No credentials were printed.'); process.exitCode = 1; });
module.exports = { config, bootstrapAdmin };
