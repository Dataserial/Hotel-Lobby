const crypto = require('crypto');
const request = require('supertest');
const { createApp } = require('../app');
const { hashToken } = require('../lib/auth');
const { createBooking, updateBooking, cancelBooking } = require('../services/booking-service');
const { startDatabase, expectConsistent, sample } = require('./task3-db');
const { instrument, barrier } = require('./task3-hooks');

let db, token;
const actorId = sample.users[1]._id;
const roomA = sample.rooms[0]._id, roomB = sample.rooms[2]._id;
const input = (extra = {}) => ({
  guestId: sample.guests[0]._id, roomId: roomA, guestCount: 2,
  checkInDate: '2026-11-10', checkOutDate: '2026-11-12', ...extra,
});
beforeAll(async () => { db = await startDatabase(); }, 180000);
beforeEach(async () => {
  await db.reset();
  token = crypto.randomBytes(32).toString('base64url');
  await db.prisma.session.create({ data: {
    tokenHash: hashToken(token), userId: actorId, expiresAt: new Date(Date.now() + 3600000),
  } });
});
afterEach(async () => expectConsistent(db.prisma));
afterAll(async () => { if (db) await db.stop(); }, 30000);

function racingApp(wait, model = 'room') {
  let waited = false;
  return createApp(instrument(db.prisma, async ({ model: current, method, run }) => {
    const result = await run();
    if (!waited && current === model && method === 'findUnique') {
      waited = true;
      await wait();
    }
    return result;
  }));
}
const send = (app, method, path, data) => request(app)[method](path)
  .set('Authorization', `Bearer ${token}`).send(data);
function expectOneWinner(results, success = 201) {
  expect(results.map((r) => r.status).sort()).toEqual([success, 409].sort());
  expect(results.find((r) => r.status === 409).body.error.code).toBe('ROOM_UNAVAILABLE');
}

describe.each([1, 2, 3])('race round %i with fresh fixtures', () => {
  test('create-create commits exactly one booking and payment', async () => {
    const wait = barrier();
    const results = await Promise.all([
      send(racingApp(wait), 'post', '/api/bookings', input()),
      send(racingApp(wait), 'post', '/api/bookings', input()),
    ]);
    expectOneWinner(results);
    expect(await db.prisma.booking.count()).toBe(sample.bookings.length + 1);
    expect(await db.prisma.payment.count()).toBe(sample.payments.length + 1);
  });

  test('edit-create cannot both acquire the same target nights', async () => {
    const original = await createBooking(db.prisma, input({ roomId: roomB }), actorId);
    const wait = barrier();
    const results = await Promise.all([
      send(racingApp(wait), 'patch', `/api/bookings/${original.id}`, { roomId: roomA }),
      send(racingApp(wait), 'post', '/api/bookings', input()),
    ]);
    expect(results.filter((r) => r.status === 200 || r.status === 201)).toHaveLength(1);
    expect(results.find((r) => r.status === 409).body.error.code).toBe('ROOM_UNAVAILABLE');
    if (results[0].status === 409) {
      expect(await db.prisma.booking.findUnique({ where: { id: original.id } }))
        .toMatchObject({ roomId: roomB, totalPrice: 3600 });
    }
  });

  test('edit-edit competing bookings preserve the losing booking and its claims', async () => {
    const first = await createBooking(db.prisma, input({ checkInDate: '2026-11-01', checkOutDate: '2026-11-03' }), actorId);
    const second = await createBooking(db.prisma, input({ roomId: roomB, checkInDate: '2026-11-01', checkOutDate: '2026-11-03' }), actorId);
    const wait = barrier();
    const changes = { roomId: roomA, checkInDate: input().checkInDate, checkOutDate: input().checkOutDate };
    const results = await Promise.all([
      send(racingApp(wait), 'patch', `/api/bookings/${first.id}`, changes),
      send(racingApp(wait), 'patch', `/api/bookings/${second.id}`, changes),
    ]);
    expectOneWinner(results, 200);
    const loser = results[0].status === 409 ? first : second;
    expect(await db.prisma.booking.findUnique({ where: { id: loser.id } })).toEqual(loser);
    expect(await db.prisma.booking.count()).toBe(sample.bookings.length + 2);
  });

  test('cancel-create is equivalent to a valid serial order, and the room can be rebooked', async () => {
    const original = await createBooking(db.prisma, input(), actorId);
    const wait = barrier();
    const results = await Promise.all([
      send(racingApp(wait, 'booking'), 'post', `/api/bookings/${original.id}/cancel`),
      send(racingApp(wait), 'post', '/api/bookings', input()),
    ]);
    expect(results[0].status).toBe(200);
    expect([201, 409]).toContain(results[1].status);
    if (results[1].status === 409) {
      expect(results[1].body.error.code).toBe('ROOM_UNAVAILABLE');
      await send(createApp(db.prisma), 'post', '/api/bookings', input()).expect(201);
    }
    expect(await db.prisma.roomNightClaim.count({ where: { bookingId: original.id } })).toBe(0);
    expect(await db.prisma.booking.count()).toBe(sample.bookings.length + 2);
  });
});

test('same-booking concurrent partial edits retry against the current booking', async () => {
  const original = await createBooking(db.prisma, input(), actorId);
  const wait = barrier();
  const results = await Promise.all([
    send(racingApp(wait, 'booking'), 'patch', `/api/bookings/${original.id}`, { guestCount: 1 }),
    send(racingApp(wait, 'booking'), 'patch', `/api/bookings/${original.id}`, { checkOutDate: '2026-11-13' }),
  ]);
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  expect(await db.prisma.booking.findUnique({ where: { id: original.id } }))
    .toMatchObject({ guestCount: 1, checkOutDate: '2026-11-13', totalPrice: 3600 });
});

async function snapshot() {
  return Promise.all(['booking', 'payment', 'roomNightClaim'].map((model) =>
    db.prisma[model].findMany({ orderBy: { id: 'asc' } })));
}
test.each(['create', 'update', 'cancel'])('%s rolls back every write on a late non-retryable failure', async (operation) => {
  const original = operation === 'create' ? null : await createBooking(db.prisma, input(), actorId);
  const before = await snapshot();
  const client = instrument(db.prisma, async ({ model, method, run }) => {
    const result = await run();
    const lastWrite = operation === 'create' ? model === 'payment' && method === 'create' :
      operation === 'update' ? model === 'payment' && method === 'update' :
        model === 'roomNightClaim' && method === 'deleteMany';
    if (lastWrite) throw new Error('Injected late failure');
    return result;
  });
  const mutation = operation === 'create' ? createBooking(client, input(), actorId) :
    operation === 'update' ? updateBooking(client, original.id, { roomId: roomB, checkOutDate: '2026-11-13' }, actorId) :
      cancelBooking(client, original.id, actorId);
  await expect(mutation).rejects.toThrow('Injected late failure');
  expect(await snapshot()).toEqual(before);
});
