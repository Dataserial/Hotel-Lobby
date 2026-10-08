const { startDatabase, sample, expectConsistent } = require('./task3-db');
const { instrument, barrier } = require('./task3-hooks');
const { createBooking, updateBooking, cancelBooking } = require('../services/booking-service');
const { receivePayment, refundPayment } = require('../services/payment-service');
const { checkIn, checkOut } = require('../services/stay-service');
const { recordTestReceipt } = require('./payment-fixture');
const { auditPayments } = require('../services/payment-reconciliation');
let db;
const actorId = sample.users[1]._id;
const input = { guestId: sample.guests[0]._id, roomId: sample.rooms[0]._id, guestCount: 2, checkInDate: '2026-11-01', checkOutDate: '2026-11-03' };
const clock = () => new Date('2026-11-01T00:00:00Z');
const money = (amount = 100, reference = 'atomic-receipt') => ({ amount, method: 'cash', reference, occurredAt: '2026-01-01T00:00:00Z' });
const receive = (p, id, amount = 100, ref = 'atomic-receipt', key = ref) => receivePayment(p, id, money(amount, ref), key, actorId);
const refund = (p, id, receiptId, amount = 100, ref = 'atomic-refund', key = ref) => refundPayment(p, id, { ...money(amount, ref), receiptId, reason: 'Synthetic refund' }, key, actorId);
const makeBooking = (extra = {}) => createBooking(db.prisma, { ...input, ...extra }, actorId);
beforeAll(async () => { db = await startDatabase('hotel_lobby_task4_test'); }, 180000);
beforeEach(async () => db.reset());
afterAll(async () => { if (db) await db.stop(); }, 30000);
afterEach(async () => {
  await expectConsistent(db.prisma);
  expect((await auditPayments(db.prisma)).issues).toEqual([]);
  const [rooms, stays] = await Promise.all([db.prisma.room.findMany(), db.prisma.booking.findMany({ where: { status: 'checked_in' } })]);
  for (const room of rooms) {
    const occupants = stays.filter((b) => b.roomId === room.id);
    expect(occupants.length).toBeLessThanOrEqual(1);
    expect(room.status === 'occupied').toBe(occupants.length === 1);
  }
});
async function snapshot() {
  return Promise.all(['booking', 'room', 'payment', 'paymentTransaction', 'roomNightClaim'].map((model) => db.prisma[model].findMany({ orderBy: { id: 'asc' } })));
}
async function prepare(operation) {
  const b = await makeBooking();
  let r;
  if (operation === 'refund') r = await recordTestReceipt(db.prisma, b.id, actorId);
  if (operation === 'check-out') {
    await recordTestReceipt(db.prisma, b.id, actorId, 2400);
    await checkIn(db.prisma, b.id, actorId, clock);
  }
  return { b, run: (p) => {
    if (operation === 'receive') return receive(p, b.id);
    if (operation === 'refund') return refund(p, b.id, r.id);
    if (operation === 'cancel') return cancelBooking(p, b.id, actorId);
    if (operation === 'check-in') return checkIn(p, b.id, actorId, clock);
    return checkOut(p, b.id, actorId, clock);
  } };
}
const writeStages = [
  ...['receive', 'refund'].flatMap((op) => ['booking.update', 'paymentTransaction.create', 'payment.update'].map((stage) => [op, stage])),
  ...['booking.update', 'payment.update', 'roomNightClaim.deleteMany'].map((stage) => ['cancel', stage]),
  ...['check-in', 'check-out'].flatMap((op) => ['booking.update', 'room.updateMany'].map((stage) => [op, stage])),
];
test.each(writeStages)('%s rolls back all models after %s fails', async (operation, stage) => {
  const prepared = await prepare(operation);
  const before = await snapshot();
  let injected = 0;
  const client = instrument(db.prisma, async ({ model, method, run }) => {
    const result = await run();
    if (`${model}.${method}` === stage) { injected++; throw new Error('Injected write failure'); }
    return result;
  });
  await expect(prepared.run(client)).rejects.toThrow('Injected write failure');
  expect(injected).toBe(1);
  expect(await snapshot()).toEqual(before);
});
test.each(['receive', 'refund', 'cancel', 'check-in', 'check-out'])('%s retries a complete transaction with fresh actor/state and no duplicate writes', async (operation) => {
  const prepared = await prepare(operation);
  let actorReads = 0, bookingReads = 0, aborts = 0;
  const lastWrite = ['receive', 'refund', 'cancel'].includes(operation) ? 'payment.update' : 'room.updateMany';
  const before = await db.prisma.paymentTransaction.count();
  const client = instrument(db.prisma, async ({ model, method, run }) => {
    const result = await run();
    if (model === 'user' && method === 'findUnique') actorReads++;
    if (model === 'booking' && method === 'findUnique') bookingReads++;
    if (`${model}.${method}` === lastWrite && aborts++ < 2) throw Object.assign(new Error('Transient abort'), { code: 'P2034' });
    return result;
  });
  await prepared.run(client);
  expect(actorReads).toBe(3);
  expect(bookingReads).toBe(3);
  expect(await db.prisma.paymentTransaction.count()).toBe(before + (['receive', 'refund'].includes(operation) ? 1 : 0));
});
test.each(['receive', 'refund', 'cancel', 'check-in', 'check-out'])('%s stops after three transaction conflicts', async (operation) => {
  const prepared = await prepare(operation);
  const before = await snapshot();
  const client = { $transaction: jest.fn().mockRejectedValue(Object.assign(new Error('Conflict'), { code: 'P2034' })) };
  await expect(prepared.run(client)).rejects.toMatchObject({ code: 'WRITE_CONFLICT' });
  expect(client.$transaction).toHaveBeenCalledTimes(3);
  expect(await snapshot()).toEqual(before);
});
test('transient retry observes a changed guard and actor instead of reusing stale validation', async () => {
  const b = await makeBooking();
  let writes = 0;
  const client = instrument(db.prisma, async ({ model, method, run }) => {
    const result = await run();
    if (model === 'booking' && method === 'update' && writes++ === 0) {
      await db.prisma.user.update({ where: { id: actorId }, data: { active: false } });
      throw Object.assign(new Error('Conflict'), { code: 'P2034' });
    }
    return result;
  });
  await expect(receive(client, b.id)).rejects.toMatchObject({ code: 'INVALID_ACTOR' });
  expect(await db.prisma.paymentTransaction.count()).toBe(1);
});
test('transient retry re-reads a concurrently cancelled booking before recording money', async () => {
  const b = await makeBooking(); let aborted = false;
  const client = instrument(db.prisma, async ({ model, method, run }) => {
    const result = await run();
    if (!aborted && model === 'booking' && method === 'findUnique') {
      aborted = true;
      await cancelBooking(db.prisma, b.id, actorId);
      throw Object.assign(new Error('Stale snapshot'), { code: 'P2034' });
    }
    return result;
  });
  await expect(receive(client, b.id)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  expect(await db.prisma.paymentTransaction.count()).toBe(1);
});
function racingClient(wait) {
  let waited = false;
  return instrument(db.prisma, async ({ model, method, run }) => {
    const result = await run();
    if (!waited && model === 'booking' && method === 'findUnique') { waited = true; await wait(); }
    return result;
  });
}
async function race(first, second) {
  const wait = barrier();
  return Promise.allSettled([first(racingClient(wait)), second(racingClient(wait))]);
}
function oneWinner(results, codes) {
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(codes).toContain(results.find((r) => r.status === 'rejected').reason.code);
}
describe.each([1, 2])('race round %i', () => {
  test('receipts cannot jointly exceed remaining balance', async () => {
    const b = await makeBooking();
    oneWinner(await race((p) => receive(p, b.id, 1500, 'a'), (p) => receive(p, b.id, 1500, 'b')), ['PAYMENT_EXCEEDS_REMAINING']);
  });
  test('refunds cannot jointly exceed a source receipt', async () => {
    const b = await makeBooking(); const r = await recordTestReceipt(db.prisma, b.id, actorId);
    oneWinner(await race((p) => refund(p, b.id, r.id, 70, 'a'), (p) => refund(p, b.id, r.id, 70, 'b')), ['REFUND_EXCEEDS_RECEIPT']);
  });
  test('same key replays the winner exactly once', async () => {
    const b = await makeBooking();
    const results = await race((p) => receive(p, b.id), (p) => receive(p, b.id));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(results[0].value.transaction.id).toBe(results[1].value.transaction.id);
    expect(results.map((r) => r.value.replayed).sort()).toEqual([false, true]);
  });
  test('same evidence under different keys is not duplicated', async () => {
    const b = await makeBooking();
    oneWinner(await race((p) => receive(p, b.id, 100, 'same', 'a'), (p) => receive(p, b.id, 100, 'same', 'b')), ['DUPLICATE_REFERENCE']);
  });
  test('receive and cancel cannot bypass the refund guard', async () => {
    const b = await makeBooking();
    oneWinner(await race((p) => receive(p, b.id), (p) => cancelBooking(p, b.id, actorId)), ['PAYMENT_REFUND_REQUIRED', 'INVALID_TRANSITION']);
  });
  test('receive and lower reprice cannot leave an overpaid booking', async () => {
    const b = await makeBooking();
    oneWinner(await race((p) => receive(p, b.id, 2000), (p) => updateBooking(p, b.id, { checkOutDate: '2026-11-02' }, actorId)), ['PAYMENT_ADJUSTMENT_REQUIRED', 'PAYMENT_EXCEEDS_REMAINING']);
  });
  test('refund and check-in observe the serialized booking state', async () => {
    const b = await makeBooking(); const r = await recordTestReceipt(db.prisma, b.id, actorId);
    const results = await race((p) => refund(p, b.id, r.id), (p) => checkIn(p, b.id, actorId, clock));
    expect(results[1].status).toBe('fulfilled');
    if (results[0].status === 'rejected') expect(results[0].reason.code).toBe('INVALID_TRANSITION');
    const payment = await db.prisma.payment.findUnique({ where: { bookingId: b.id } });
    expect(payment.refundedAmount).toBe(results[0].status === 'fulfilled' ? 100 : 0);
  });
  test('same booking check-in and check-out each have one winner', async () => {
    const b = await makeBooking();
    oneWinner(await race((p) => checkIn(p, b.id, actorId, clock), (p) => checkIn(p, b.id, actorId, clock)), ['INVALID_TRANSITION']);
    await recordTestReceipt(db.prisma, b.id, actorId, 2400);
    oneWinner(await race((p) => checkOut(p, b.id, actorId, clock), (p) => checkOut(p, b.id, actorId, clock)), ['INVALID_TRANSITION']);
  });
});
test.each(['key', 'reference'])('global %s unique race across different bookings is mapped specifically', async (collision) => {
  const a = await makeBooking(); const b = await makeBooking({ roomId: sample.rooms[2]._id });
  const results = await race(
    (p) => receive(p, a.id, 100, 'same', 'same'),
    (p) => receive(p, b.id, 100, collision === 'reference' ? 'same' : 'different', collision === 'key' ? 'same' : 'different'),
  );
  oneWinner(results, [collision === 'key' ? 'IDEMPOTENCY_CONFLICT' : 'DUPLICATE_REFERENCE']);
});
test('unrelated unique failure is not treated as replay or duplicate reference', async () => {
  const b = await makeBooking(); const before = await snapshot();
  const client = instrument(db.prisma, async ({ model, method, run }) => {
    const result = await run();
    if (model === 'payment' && method === 'update') throw Object.assign(new Error('Unrelated unique'), { code: 'P2002' });
    return result;
  });
  await expect(receive(client, b.id)).rejects.toMatchObject({ code: 'P2002' });
  expect(await snapshot()).toEqual(before);
});
