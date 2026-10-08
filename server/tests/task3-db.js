const { spawn } = require('child_process');
const path = require('path');
const { MongoMemoryReplSet } = require('mongodb-memory-server-core');
const { PrismaClient } = require('@prisma/client');
const { MongoClient } = require('mongodb');
const { seedStep2Sample, sample } = require('./test-db');
const { validateStay } = require('../services/booking-validation');

function assertTestUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'mongodb:' || url.hostname !== '127.0.0.1' || !url.port ||
      !['/hotel_lobby_task3_test', '/hotel_lobby_task4_test', '/hotel_lobby_task5_test'].includes(url.pathname) || !url.searchParams.get('replicaSet')) {
    throw new Error('Tests require a local replica set and an approved hotel_lobby_task3_test or hotel_lobby_task4_test database.');
  }
  return value;
}

async function startDatabase(database = 'hotel_lobby_task3_test') {
  if (!['hotel_lobby_task3_test', 'hotel_lobby_task4_test', 'hotel_lobby_task5_test'].includes(database)) throw new Error('Unsafe test database name');
  const mongo = await MongoMemoryReplSet.create({
    binary: process.env.MONGOD_PATH ? { systemBinary: process.env.MONGOD_PATH } : undefined,
    replSet: { count: 1, name: 'task3set', storageEngine: 'wiredTiger' },
  });
  let prisma, raw;
  try {
    const url = assertTestUrl(mongo.getUri(database));
    // Drain the replica set's stdout while schema tooling runs. A synchronous
    // subprocess can fill mongod's pipe and stall Windows handshakes.
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
        cwd: path.join(__dirname, '..'), env: { ...process.env, DATABASE_URL: url },
      });
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Test schema push timed out')); }, 120000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Test schema push failed: ${output}`)); });
    });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    raw = await new MongoClient(url).connect();
    return {
      prisma, raw, url,
      async reset() {
        assertTestUrl(url);
        await prisma.session.deleteMany();
        await seedStep2Sample(prisma);
      },
      async stop() {
        await prisma.$disconnect();
        await raw.close();
        await mongo.stop();
      },
    };
  } catch (error) {
    if (prisma) await prisma.$disconnect();
    if (raw) await raw.close();
    await mongo.stop();
    throw error;
  }
}

async function expectConsistent(prisma) {
  const [bookings, claims, payments] = await Promise.all([
    prisma.booking.findMany(), prisma.roomNightClaim.findMany(), prisma.payment.findMany(),
  ]);
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const keys = new Set();
  for (const claim of claims) {
    const booking = byId.get(claim.bookingId);
    expect(booking).toBeDefined();
    expect(booking.status).not.toBe('cancelled');
    expect(claim.roomId).toBe(booking.roomId);
    expect(validateStay(booking.checkInDate, booking.checkOutDate).nights).toContain(claim.night);
    const key = `${claim.roomId}:${claim.night}`;
    expect(keys.has(key)).toBe(false);
    keys.add(key);
  }
  for (const booking of bookings) {
    const expected = booking.status === 'cancelled' ? [] :
      validateStay(booking.checkInDate, booking.checkOutDate).nights;
    expect(claims.filter((c) => c.bookingId === booking.id).map((c) => c.night).sort()).toEqual(expected);
    const rows = payments.filter((p) => p.bookingId === booking.id);
    // The original cancelled fixture predates Payment creation.
    if (booking.status !== 'cancelled') expect(rows).toHaveLength(1);
    expect(rows.length).toBeLessThanOrEqual(1);
    for (const payment of rows) expect(payment.amount).toBe(booking.totalPrice);
  }
  for (const payment of payments) expect(byId.has(payment.bookingId)).toBe(true);
}

module.exports = { assertTestUrl, startDatabase, expectConsistent, sample };
