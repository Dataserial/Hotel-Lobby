const { spawnSync } = require('child_process');
const path = require('path');
const { auditClaims, backfillMissingClaims } = require('../services/booking-claims-maintenance');
const { options } = require('../scripts/booking-claims');
const { createBooking } = require('../services/booking-service');
const { startDatabase, expectConsistent, sample } = require('./task3-db');
const { instrument } = require('./task3-hooks');

let db;
const actorId = sample.users[1]._id;
const input = {
  guestId: sample.guests[0]._id, roomId: sample.rooms[0]._id, guestCount: 2,
  checkInDate: '2026-11-10', checkOutDate: '2026-11-12',
};
beforeAll(async () => { db = await startDatabase(); }, 180000);
beforeEach(async () => db.reset());
afterAll(async () => { if (db) await db.stop(); }, 30000);

const rows = () => Promise.all(['booking', 'payment', 'roomNightClaim'].map((model) =>
  db.prisma[model].findMany({ orderBy: { id: 'asc' } })));

test('CLI requires matching database and explicit maintenance prerequisites for apply', () => {
  expect(options(['--database', 'hotel_lobby_task3_test'], db.url)).toMatchObject({ apply: false });
  expect(() => options(['--database', 'hotel_lobby'], db.url)).toThrow();
  expect(() => options(['--apply'], db.url)).toThrow();
  expect(() => options(['--database', 'hotel_lobby_task3_test', '--apply'], db.url)).toThrow();
  expect(() => options(['--database', 'hotel_lobby_task3_test', '--unexpected'], db.url)).toThrow();
  expect(options(['--database', 'hotel_lobby_task3_test', '--apply', '--writes-stopped', '--backup-confirmed', '--copy-tested'], db.url).apply).toBe(true);
});

test('audit is read-only; backfill restores confirmed, checked-in and checked-out nights idempotently', async () => {
  const b = await createBooking(db.prisma, input, actorId);
  await db.prisma.booking.update({ where: { id: b.id }, data: { status: 'checked_out' } });
  await db.prisma.roomNightClaim.deleteMany();
  const before = await rows();
  expect(await auditClaims(db.prisma)).toMatchObject({ expectedClaimCount: 6, claimCount: 0, issues: [] });
  expect(await rows()).toEqual(before);
  const filled = await backfillMissingClaims(db.prisma);
  expect(filled).toMatchObject({ added: 6, audit: { missingClaims: [], issues: [] } });
  const after = await rows();
  expect((await backfillMissingClaims(db.prisma)).added).toBe(0);
  expect(await rows()).toEqual(after);
  expect(after[0]).toEqual(before[0]);
  expect(after[1]).toEqual(before[1]);
  await expectConsistent(db.prisma);
});

test('overlapping legacy bookings block all backfill without selecting a winner', async () => {
  await db.prisma.booking.create({ data: {
    ...input, roomId: sample.rooms[2]._id, checkInDate: '2026-10-10', checkOutDate: '2026-10-12',
    pricePerNight: 1800, totalPrice: 3600, createdById: actorId, updatedById: actorId,
  } });
  const before = await rows();
  expect((await auditClaims(db.prisma)).issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'BOOKING_COLLISION' }),
  ]));
  await expect(backfillMissingClaims(db.prisma)).rejects.toMatchObject({ code: 'CLAIMS_REPAIR_BLOCKED' });
  expect(await rows()).toEqual(before);
});

test('orphan, cancelled and extra claims are reported and never deleted automatically', async () => {
  await db.prisma.roomNightClaim.createMany({ data: [
    { bookingId: '500000000000000000000099', roomId: sample.rooms[0]._id, night: '2026-12-01' },
    { bookingId: sample.bookings[2]._id, roomId: sample.rooms[0]._id, night: '2026-12-02' },
    { bookingId: sample.bookings[1]._id, roomId: sample.rooms[0]._id, night: '2026-12-03' },
  ] });
  await db.prisma.payment.create({ data: { bookingId: '500000000000000000000099', amount: 0, recordedById: actorId } });
  const before = await rows();
  expect((await auditClaims(db.prisma)).issues.map((i) => i.code))
    .toEqual(expect.arrayContaining(['ORPHAN_CLAIM', 'CANCELLED_CLAIM', 'UNEXPECTED_CLAIM', 'ORPHAN_PAYMENT']));
  await expect(backfillMissingClaims(db.prisma)).rejects.toMatchObject({ code: 'CLAIMS_REPAIR_BLOCKED' });
  expect(await rows()).toEqual(before);
});

test('invalid dates and missing references block repair', async () => {
  await db.prisma.booking.update({ where: { id: sample.bookings[0]._id }, data: {
    roomId: '300000000000000000000099', guestId: '400000000000000000000099',
    updatedById: '100000000000000000000099', checkInDate: '2026-02-29',
  } });
  await db.prisma.room.update({ where: { id: sample.rooms[2]._id }, data: { roomTypeId: '200000000000000000000099' } });
  expect((await auditClaims(db.prisma)).issues.map((i) => i.code))
    .toEqual(expect.arrayContaining(['MISSING_ROOM', 'MISSING_GUEST', 'MISSING_ACTOR', 'MISSING_ROOM_TYPE', 'INVALID_STAY']));
  const before = await rows();
  await expect(backfillMissingClaims(db.prisma)).rejects.toMatchObject({ code: 'CLAIMS_REPAIR_BLOCKED' });
  expect(await rows()).toEqual(before);
});

test('backfill transaction rolls back a late insert failure', async () => {
  await db.prisma.roomNightClaim.deleteMany({ where: { bookingId: sample.bookings[1]._id } });
  const before = await rows();
  const client = instrument(db.prisma, async ({ model, method, run }) => {
    const result = await run();
    if (model === 'roomNightClaim' && method === 'createMany') throw new Error('Injected backfill failure');
    return result;
  });
  await expect(backfillMissingClaims(client)).rejects.toThrow('Injected backfill failure');
  expect(await rows()).toEqual(before);
});

test('CLI default audit returns nonzero without writing; explicit apply and rerun work', async () => {
  await db.prisma.roomNightClaim.deleteMany({ where: { bookingId: sample.bookings[1]._id } });
  const command = (extra = []) => spawnSync(process.execPath, [path.join(__dirname, '../scripts/booking-claims.js'),
    '--database', 'hotel_lobby_task3_test', ...extra], {
    env: { ...process.env, DATABASE_URL: db.url }, encoding: 'utf8', timeout: 30000,
  });
  const before = await rows();
  const audit = command();
  expect(audit.status).toBe(1);
  expect(JSON.parse(audit.stdout)).toMatchObject({ mode: 'audit', issues: [] });
  expect(await rows()).toEqual(before);
  const applied = command(['--apply', '--writes-stopped', '--backup-confirmed', '--copy-tested']);
  expect(applied.status).toBe(0);
  expect(JSON.parse(applied.stdout).added).toBe(2);
  expect(command().status).toBe(0);
  await expectConsistent(db.prisma);
});

test('missing live indexes block backfill even if the Prisma schema declares them', async () => {
  const collection = db.raw.db('hotel_lobby_task3_test').collection('roomNightClaims');
  await collection.dropIndex('roomNightClaims_roomId_night_key');
  await collection.dropIndex('roomNightClaims_bookingId_idx');
  try {
    expect((await auditClaims(db.prisma)).issues.map((i) => i.code))
      .toEqual(expect.arrayContaining(['MISSING_UNIQUE_INDEX', 'MISSING_BOOKING_INDEX']));
    await expect(backfillMissingClaims(db.prisma)).rejects.toMatchObject({ code: 'CLAIMS_REPAIR_BLOCKED' });
  } finally {
    await collection.createIndex({ roomId: 1, night: 1 }, { unique: true, name: 'roomNightClaims_roomId_night_key' });
    await collection.createIndex({ bookingId: 1 }, { name: 'roomNightClaims_bookingId_idx' });
  }
});
