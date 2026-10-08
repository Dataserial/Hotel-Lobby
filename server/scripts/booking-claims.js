require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const { MongoClient } = require('mongodb');
const { auditClaims, backfillMissingClaims } = require('../services/booking-claims-maintenance');

function options(args, url) {
  const allowed = new Set(['--apply', '--writes-stopped', '--backup-confirmed', '--copy-tested']);
  const parsed = { apply: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--database' && !parsed.database) parsed.database = args[++i];
    else if (allowed.has(args[i])) parsed[args[i].slice(2)] = true;
    else throw new Error('Unknown or repeated argument. Use --database NAME [--apply --writes-stopped --backup-confirmed --copy-tested].');
  }
  if (!url || !parsed.database || new MongoClient(url).options.dbName !== parsed.database) {
    throw new Error('DATABASE_URL must explicitly match --database NAME.');
  }
  if (parsed.apply && !['writes-stopped', 'backup-confirmed', 'copy-tested'].every((key) => parsed[key])) {
    throw new Error('Apply requires --writes-stopped --backup-confirmed --copy-tested.');
  }
  return parsed;
}

async function main() {
  const config = options(process.argv.slice(2), process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  try {
    const report = config.apply ? await backfillMissingClaims(prisma) : await auditClaims(prisma);
    process.stdout.write(`${JSON.stringify({ database: config.database, mode: config.apply ? 'apply' : 'audit', ...report }, null, 2)}\n`);
    const audit = config.apply ? report.audit : report;
    if (audit.issues.length || audit.missingClaims.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch((error) => {
  // Never echo a database URL (which may contain credentials) or a Prisma query.
  process.stderr.write(`${error.code === 'CLAIMS_REPAIR_BLOCKED' ? error.message : 'Claims command failed; check arguments, database access and schema.'}\n`);
  process.exitCode = 1;
});
module.exports = { options };
