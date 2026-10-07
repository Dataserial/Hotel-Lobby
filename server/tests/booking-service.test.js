const { createBooking, updateBooking, cancelBooking } = require('../services/booking-service');
const { testPrisma, seedStep2Sample, sample } = require('./test-db');
const { MongoClient, ObjectId } = require('mongodb');

const prisma = testPrisma();
const actorId = sample.users[1]._id;
const guestId = sample.guests[0]._id;
const room101 = sample.rooms[0]._id;
const room305 = sample.rooms[2]._id;

function request(overrides = {}) {
  return {
    guestId, roomId: room101, guestCount: 2,
    checkInDate: '2026-10-10', checkOutDate: '2026-10-12',
    ...overrides,
  };
}

beforeEach(async () => seedStep2Sample(prisma));
afterAll(async () => prisma.$disconnect());

test('creates booking, claims and payment summary with price snapshot', async () => {
  const booking = await createBooking(prisma, request(), actorId);
  expect(booking).toMatchObject({
    status: 'confirmed', pricePerNight: 1200, totalPrice: 2400,
    createdById: actorId, updatedById: actorId,
  });
  expect((await prisma.roomNightClaim.findMany({ where: { bookingId: booking.id } }))
    .map(({ night }) => night).sort()).toEqual(['2026-10-10', '2026-10-11']);
  expect(await prisma.payment.findUnique({ where: { bookingId: booking.id } }))
    .toMatchObject({ amount: 2400, paidAmount: 0, status: 'pending' });

  await prisma.roomType.update({ where: { nameKey: 'standard' }, data: { basePrice: 1700 } });
  expect((await prisma.booking.findUnique({ where: { id: booking.id } })).totalPrice).toBe(2400);
  const adjacent = await createBooking(prisma, request({
    checkInDate: '2026-10-12', checkOutDate: '2026-10-13',
  }), actorId);
  expect(adjacent.totalPrice).toBe(1700);
});

test('overlap rolls back booking and payment and preserves existing claims', async () => {
  const count = await prisma.booking.count();
  await expect(createBooking(prisma, request({ roomId: room305 }), actorId))
    .rejects.toMatchObject({ status: 409, code: 'ROOM_UNAVAILABLE' });
  expect(await prisma.booking.count()).toBe(count);
  expect(await prisma.payment.count()).toBe(sample.payments.length);
  expect(await prisma.roomNightClaim.count()).toBe(sample.roomNightClaims.length);
});

test('rejects closed or full rooms, missing records and untrusted actor', async () => {
  await expect(createBooking(prisma, request({ roomId: sample.rooms[3]._id }), actorId))
    .rejects.toMatchObject({ code: 'ROOM_UNAVAILABLE' });
  await expect(createBooking(prisma, request({ guestCount: 3 }), actorId))
    .rejects.toMatchObject({ code: 'CAPACITY_EXCEEDED' });
  await expect(createBooking(prisma, request({ guestId: '400000000000000000000099' }), actorId))
    .rejects.toMatchObject({ code: 'GUEST_NOT_FOUND' });
  await expect(createBooking(prisma, request(), '100000000000000000000099'))
    .rejects.toMatchObject({ code: 'INVALID_ACTOR' });
});

test('update replaces claims and payment amount atomically', async () => {
  const booking = await createBooking(prisma, request(), actorId);
  const updated = await updateBooking(prisma, booking.id, {
    roomId: room305, checkInDate: '2026-10-12', checkOutDate: '2026-10-14',
  }, actorId);
  expect(updated).toMatchObject({ roomId: room305, pricePerNight: 1800, totalPrice: 3600 });
  expect((await prisma.roomNightClaim.findMany({ where: { bookingId: booking.id } }))
    .map(({ roomId, night }) => ({ roomId, night })).sort((a, b) => a.night.localeCompare(b.night)))
    .toEqual([
      { roomId: room305, night: '2026-10-12' },
      { roomId: room305, night: '2026-10-13' },
    ]);
  expect((await prisma.payment.findUnique({ where: { bookingId: booking.id } })).amount).toBe(3600);
});

test('failed update rolls back booking, payment and original claims', async () => {
  const booking = await createBooking(prisma, request(), actorId);
  await expect(updateBooking(prisma, booking.id, { roomId: room305 }, actorId))
    .rejects.toMatchObject({ code: 'ROOM_UNAVAILABLE' });
  expect(await prisma.booking.findUnique({ where: { id: booking.id } }))
    .toMatchObject({ roomId: room101, totalPrice: 2400 });
  expect((await prisma.roomNightClaim.findMany({ where: { bookingId: booking.id } }))
    .map(({ night }) => night).sort()).toEqual(['2026-10-10', '2026-10-11']);
  expect((await prisma.payment.findUnique({ where: { bookingId: booking.id } })).amount).toBe(2400);
});

test('received money blocks price changes and cancellation until refunded', async () => {
  const booking = await createBooking(prisma, request(), actorId);
  await prisma.payment.update({ where: { bookingId: booking.id }, data: { paidAmount: 100 } });
  await expect(updateBooking(prisma, booking.id, { checkOutDate: '2026-10-13' }, actorId))
    .rejects.toMatchObject({ code: 'PAYMENT_ADJUSTMENT_REQUIRED' });
  await expect(cancelBooking(prisma, booking.id, actorId))
    .rejects.toMatchObject({ code: 'PAYMENT_REFUND_REQUIRED' });
  await prisma.payment.update({ where: { bookingId: booking.id }, data: { refundedAmount: 100 } });
  expect((await cancelBooking(prisma, booking.id, actorId)).status).toBe('cancelled');
});

test('cancel releases nights for rebooking and prevents invalid transition', async () => {
  const booking = await createBooking(prisma, request(), actorId);
  await cancelBooking(prisma, booking.id, actorId);
  expect(await prisma.roomNightClaim.count({ where: { bookingId: booking.id } })).toBe(0);
  const replacement = await createBooking(prisma, request(), actorId);
  expect(replacement.id).not.toBe(booking.id);
  await expect(updateBooking(prisma, booking.id, { guestCount: 1 }, actorId))
    .rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  await expect(cancelBooking(prisma, booking.id, actorId))
    .rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
});

test('two concurrent requests for the same night yield exactly one booking', async () => {
  const input = request({ checkInDate: '2026-10-20', checkOutDate: '2026-10-21' });
  const results = await Promise.allSettled([
    createBooking(prisma, input, actorId), createBooking(prisma, input, actorId),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toMatchObject([
    { reason: expect.objectContaining({ status: 409, code: 'ROOM_UNAVAILABLE' }) },
  ]);
  const winners = await prisma.booking.findMany({
    where: { roomId: room101, checkInDate: '2026-10-20' },
  });
  expect(winners).toHaveLength(1);
  expect(await prisma.roomNightClaim.count({
    where: { roomId: room101, night: '2026-10-20' },
  })).toBe(1);
  const claims = await prisma.roomNightClaim.findMany();
  for (const claim of claims) {
    expect(await prisma.booking.findUnique({ where: { id: claim.bookingId } })).not.toBeNull();
  }
});

test('keeps the original Room collection and number field readable', async () => {
  const client = new MongoClient(process.env.DATABASE_URL);
  await client.connect();
  const id = new ObjectId();
  try {
    await client.db('hotel_lobby_step9_test').collection('Room').insertOne({ _id: id, number: '999' });
    const room = await prisma.room.findUnique({ where: { id: id.toHexString() } });
    expect(room.number).toBe('999');
    await expect(createBooking(prisma, request({ roomId: id.toHexString() }), actorId))
      .rejects.toMatchObject({ code: 'ROOM_UNAVAILABLE' });
  } finally {
    await client.close();
  }
});

test('rejects null updates and never leaves claims without a booking', async () => {
  const booking = await createBooking(prisma, request(), actorId);
  await expect(updateBooking(prisma, booking.id, { roomId: null }, actorId))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  await cancelBooking(prisma, booking.id, actorId);
  const claims = await prisma.roomNightClaim.findMany();
  for (const claim of claims) {
    const owner = await prisma.booking.findUnique({ where: { id: claim.bookingId } });
    expect(owner).not.toBeNull();
    expect(owner.status).not.toBe('cancelled');
  }
});
