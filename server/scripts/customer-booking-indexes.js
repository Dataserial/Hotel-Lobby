// ตรวจและเพิ่มดัชนีที่ใช้กับการจองของลูกค้า
const { MongoClient } = require('mongodb');
const plans = [
  { collection: 'guests', name: 'guests_customerId_createdAt_idx', key: { customerId: 1, createdAt: 1 } },
  { collection: 'bookings', name: 'bookings_customerId_createdAt_idx', key: { customerId: 1, createdAt: 1 } },
];
const required = [
  { collection: 'guests', key: { documentNoKey: 1 } },
  { collection: 'payments', key: { bookingId: 1 } },
  { collection: 'roomNightClaims', key: { roomId: 1, night: 1 } },
];
const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function prepareCustomerBooking(db, { apply = false } = {}) {
  const report = { database: db.databaseName, apply, additions: [], counts: {} };
  for (const requirement of required) {
    const indexes = await db.collection(requirement.collection).listIndexes().toArray();
    if (!indexes.some(index => index.unique && !index.partialFilterExpression && !index.sparse && sameKey(index.key, requirement.key))) {
      throw new Error('Missing prerequisite unique index: ' + requirement.collection);
    }
  }
  for (const plan of plans) {
    const collection = db.collection(plan.collection);
    report.counts[plan.collection] = await collection.countDocuments();
    const indexes = await collection.listIndexes().toArray();
    const named = indexes.find(index => index.name === plan.name);
    if (named && !sameKey(named.key, plan.key)) throw new Error('Conflicting index: ' + plan.name);
    if (!indexes.some(index => sameKey(index.key, plan.key))) {
      report.additions.push(plan.name);
      if (apply) await collection.createIndex(plan.key, { name: plan.name });
    }
  }
  if (!(await db.listCollections({ name: 'customerBookingRequests' }).toArray()).length) {
    report.additions.push('customerBookingRequests (unique _id)');
    if (apply) await db.createCollection('customerBookingRequests');
  }
  // เพิ่มเฉพาะดัชนี โดยไม่เขียนทับเอกสาร ลบข้อมูล หรือลบดัชนีเดิม
  return report;
}
// เริ่มขั้นตอนหลัก: ตรวจและเพิ่มดัชนีที่ใช้กับการจองของลูกค้า
async function main() {
  require('dotenv').config({ quiet: true });
  const args = process.argv.slice(2);
  const databaseFlag = args.indexOf('--database');
  const expected = databaseFlag >= 0 ? args[databaseFlag + 1] : null;
  if (!expected || args.some((arg, index) => !['--apply', '--database'].includes(arg) && index !== databaseFlag + 1)) throw new Error('Usage: node scripts/customer-booking-indexes.js --database <verified-name> [--apply]');
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db();
    if (db.databaseName !== expected || ['admin', 'local', 'config', 'test'].includes(expected)) throw new Error('Database target mismatch');
    console.log(JSON.stringify(await prepareCustomerBooking(db, { apply: args.includes('--apply') }), null, 2));
  } finally { await client.close(); }
}
if (require.main === module) main().catch(() => { console.error('Customer booking index preparation failed. Check the target database and prerequisite indexes; no data was deleted.'); process.exitCode = 1; });
module.exports = { prepareCustomerBooking };
