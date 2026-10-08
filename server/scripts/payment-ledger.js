require('dotenv').config();
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { MongoClient } = require('mongodb');
const { auditPayments, reconcilePayment } = require('../services/payment-reconciliation');

async function main() {
  const args = process.argv.slice(2);
  const apply = args[0] === 'reconcile';
  if (args.length && args[0] !== 'audit' && !apply) throw new Error('Use audit or reconcile <database-name> <evidence.json> <actorId>');
  if ((apply && args.length !== 4) || (!apply && args.length > 1)) throw new Error('Invalid arguments');
  const url = new URL(process.env.DATABASE_URL);
  const database = url.pathname.slice(1);
  if (apply && args[1] !== database) throw new Error('Explicit database name must match DATABASE_URL');
  const prisma = new PrismaClient();
  const raw = new MongoClient(process.env.DATABASE_URL);
  try {
    await raw.connect();
    const indexes = await raw.db(database).collection('paymentTransactions').listIndexes().toArray();
    const hasUnique = (fields) => indexes.some((i) => i.unique && JSON.stringify(Object.keys(i.key)) === JSON.stringify(fields));
    if (!hasUnique(['idempotencyKey']) || !hasUnique(['kind', 'method', 'reference'])) throw new Error('Required ledger unique indexes missing');
    if (apply) await reconcilePayment(prisma, JSON.parse(fs.readFileSync(args[2], 'utf8')), args[3]);
    const report = await auditPayments(prisma);
    console.log(JSON.stringify({ database, ...report }, null, 2));
    if (report.issues.length) process.exitCode = 1;
  } finally { await prisma.$disconnect(); await raw.close(); }
}
main().catch((e) => { console.error(e.code || 'PAYMENT_AUDIT_FAILED', e.message); process.exitCode = 1; });
