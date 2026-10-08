const { startDatabase, sample } = require('./task3-db');
const { auditPayments, reconcilePayment } = require('../services/payment-reconciliation');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ObjectId } = require('mongodb');
let db;
const actorId = sample.users[1]._id;
const bookingId = sample.bookings[1]._id;
const evidence = (transactions = []) => ({ verified: true, bookingId, transactions });
const receipt = (amount = 100) => ({
  id: '710000000000000000000001', recordedById: actorId, kind: 'receive',
  amount, method: 'cash', reference: 'VERIFIED-TEST-VOUCHER', idempotencyKey: 'import-test',
  occurredAt: '2026-01-01T00:00:00Z',
});
beforeAll(async () => { db = await startDatabase('hotel_lobby_task4_test'); }, 180000);
beforeEach(async () => db.reset());
afterAll(async () => { if (db) await db.stop(); }, 30000);

test('audit is read only; verified zero balances can be enabled and repeated', async () => {
  await db.prisma.payment.update({ where: { bookingId }, data: { ledgerReady: false } });
  expect((await auditPayments(db.prisma)).issues).toContainEqual({ bookingId, code: 'PAYMENT_RECONCILIATION_REQUIRED' });
  expect((await db.prisma.payment.findUnique({ where: { bookingId } })).ledgerReady).toBe(false);
  await reconcilePayment(db.prisma, evidence(), actorId);
  await reconcilePayment(db.prisma, evidence(), actorId);
  expect((await auditPayments(db.prisma)).issues).toEqual([]);
  expect(await db.prisma.paymentTransaction.count()).toBe(1); // synthetic sample receipt only
});
test('verified real evidence imports once; missing or differing evidence rolls back', async () => {
  await db.prisma.payment.update({ where: { bookingId }, data: { ledgerReady: false, paidAmount: 100 } });
  await expect(reconcilePayment(db.prisma, evidence(), actorId)).rejects.toMatchObject({ code: 'PAYMENT_INCONSISTENT' });
  await expect(reconcilePayment(db.prisma, evidence([receipt(99)]), actorId)).rejects.toMatchObject({ code: 'PAYMENT_INCONSISTENT' });
  expect(await db.prisma.paymentTransaction.count({ where: { reference: 'VERIFIED-TEST-VOUCHER' } })).toBe(0);
  await reconcilePayment(db.prisma, evidence([receipt()]), actorId);
  await reconcilePayment(db.prisma, evidence([receipt()]), actorId);
  expect(await db.prisma.paymentTransaction.count({ where: { reference: 'VERIFIED-TEST-VOUCHER' } })).toBe(1);
  await expect(reconcilePayment(db.prisma, evidence([{ ...receipt(), reference: 'changed' }]), actorId))
    .rejects.toMatchObject({ code: 'PAYMENT_INCONSISTENT' });
  expect((await auditPayments(db.prisma)).issues).toEqual([]);
});
test('database unique indexes reject duplicate keys and evidence across payments', async () => {
  const source = await db.prisma.paymentTransaction.findFirst();
  const other = await db.prisma.payment.findUnique({ where: { bookingId } });
  const { id, createdAt, ...data } = source;
  await expect(db.prisma.paymentTransaction.create({ data: { ...data, paymentId: other.id, reference: 'other' } }))
    .rejects.toMatchObject({ code: 'P2002' });
  await expect(db.prisma.paymentTransaction.create({ data: { ...data, paymentId: other.id, idempotencyKey: 'other' } }))
    .rejects.toMatchObject({ code: 'P2002' });
});
test('old MongoDB documents with missing readiness/version fields reconcile safely', async () => {
  const raw = db.raw.db('hotel_lobby_task4_test');
  await raw.collection('bookings').updateOne({ _id: new ObjectId(bookingId) }, { $unset: { version: '' } });
  await raw.collection('payments').updateOne({ bookingId: new ObjectId(bookingId) }, { $unset: { ledgerReady: '' } });
  expect((await auditPayments(db.prisma)).issues).toContainEqual({ bookingId, code: 'PAYMENT_RECONCILIATION_REQUIRED' });
  await reconcilePayment(db.prisma, evidence(), actorId);
  expect((await db.prisma.booking.findUnique({ where: { id: bookingId } })).version).toBe(1);
  expect((await auditPayments(db.prisma)).issues).toEqual([]);
});
function cli(args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '../scripts/payment-ledger.js'), ...args], {
      env: { ...process.env, DATABASE_URL: db.url },
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Ledger CLI timed out')); }, 30000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}
test('CLI defaults to read-only audit; explicit target reconciliation and rerun work', async () => {
  await db.prisma.payment.update({ where: { bookingId }, data: { ledgerReady: false } });
  const before = await db.prisma.payment.findMany();
  expect((await cli()).code).toBe(1);
  expect(await db.prisma.payment.findMany()).toEqual(before);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hotel-task4-evidence-'));
  const filename = path.join(directory, 'evidence.json');
  fs.writeFileSync(filename, JSON.stringify(evidence()));
  try {
    const mismatch = await cli(['reconcile', 'wrong-target', filename, actorId]);
    expect(mismatch.code).toBe(1);
    expect(mismatch.stderr).toContain('Explicit database name must match');
    expect(await db.prisma.payment.findMany()).toEqual(before);
    expect((await cli(['reconcile', 'hotel_lobby_task4_test', filename, actorId])).code).toBe(0);
    expect((await cli(['reconcile', 'hotel_lobby_task4_test', filename, actorId])).code).toBe(0);
    const audit = await cli();
    expect(audit.code).toBe(0);
    expect(JSON.parse(audit.stdout)).toMatchObject({ database: 'hotel_lobby_task4_test', issues: [] });
  } finally { fs.unlinkSync(filename); fs.rmdirSync(directory); }
});
test('missing live unique index blocks CLI reconciliation before writes', async () => {
  const collection = db.raw.db('hotel_lobby_task4_test').collection('paymentTransactions');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hotel-task4-evidence-'));
  const filename = path.join(directory, 'evidence.json');
  fs.writeFileSync(filename, JSON.stringify(evidence()));
  await db.prisma.payment.update({ where: { bookingId }, data: { ledgerReady: false } });
  await collection.dropIndex('paymentTransactions_idempotencyKey_key');
  try {
    const result = await cli(['reconcile', 'hotel_lobby_task4_test', filename, actorId]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Required ledger unique indexes missing');
    expect((await db.prisma.payment.findUnique({ where: { bookingId } })).ledgerReady).toBe(false);
  } finally {
    await collection.createIndex({ idempotencyKey: 1 }, { unique: true, name: 'paymentTransactions_idempotencyKey_key' });
    fs.unlinkSync(filename); fs.rmdirSync(directory);
  }
});
