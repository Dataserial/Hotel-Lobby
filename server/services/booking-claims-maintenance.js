const { BookingError, validateStay } = require('./booking-validation');

const holdsNights = new Set(['confirmed', 'checked_in', 'checked_out']);
const claimKey = ({ roomId, night }) => `${roomId}:${night}`;

async function auditClaims(prisma) {
  const [bookings, claims, rooms, types, guests, users, payments, indexes] = await Promise.all([
    prisma.booking.findMany(), prisma.roomNightClaim.findMany(),
    prisma.room.findMany({ select: { id: true, roomTypeId: true } }),
    prisma.roomType.findMany({ select: { id: true } }),
    prisma.guest.findMany({ select: { id: true } }), prisma.user.findMany({ select: { id: true } }),
    prisma.payment.findMany({ select: { bookingId: true } }),
    prisma.$runCommandRaw({ listIndexes: 'roomNightClaims' }),
  ]);
  const issues = [], expected = new Map(), actual = new Map();
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const typeIds = new Set(types.map((t) => t.id));
  const guestIds = new Set(guests.map((g) => g.id));
  const userIds = new Set(users.map((u) => u.id));
  const indexRows = indexes.cursor?.firstBatch || [];
  if (!indexRows.some((i) => i.unique === true && !i.sparse && !i.partialFilterExpression &&
      JSON.stringify(i.key) === '{"roomId":1,"night":1}')) {
    issues.push({ code: 'MISSING_UNIQUE_INDEX' });
  }
  if (!indexRows.some((i) => JSON.stringify(i.key) === '{"bookingId":1}')) {
    issues.push({ code: 'MISSING_BOOKING_INDEX' });
  }
  for (const b of bookings) {
    const room = roomById.get(b.roomId);
    if (!room) issues.push({ code: 'MISSING_ROOM', bookingId: b.id });
    else if (!typeIds.has(room.roomTypeId)) issues.push({ code: 'MISSING_ROOM_TYPE', bookingId: b.id });
    if (!guestIds.has(b.guestId)) issues.push({ code: 'MISSING_GUEST', bookingId: b.id });
    if (!userIds.has(b.createdById) || !userIds.has(b.updatedById)) issues.push({ code: 'MISSING_ACTOR', bookingId: b.id });
    let nights;
    try { nights = validateStay(b.checkInDate, b.checkOutDate).nights; }
    catch (_error) { issues.push({ code: 'INVALID_STAY', bookingId: b.id }); continue; }
    if (b.status === 'cancelled') continue;
    if (!holdsNights.has(b.status)) { issues.push({ code: 'INVALID_STATUS', bookingId: b.id }); continue; }
    for (const night of nights) {
      const claim = { bookingId: b.id, roomId: b.roomId, night };
      const key = claimKey(claim);
      const previous = expected.get(key);
      if (previous) issues.push({ code: 'BOOKING_COLLISION', bookingIds: [previous.bookingId, b.id], roomId: b.roomId, night });
      else expected.set(key, claim);
    }
  }
  for (const c of claims) {
    const b = byId.get(c.bookingId);
    const key = claimKey(c);
    if (actual.has(key)) issues.push({ code: 'DUPLICATE_CLAIM', claimId: c.id });
    actual.set(key, c);
    if (!b) issues.push({ code: 'ORPHAN_CLAIM', claimId: c.id });
    else if (b.status === 'cancelled') issues.push({ code: 'CANCELLED_CLAIM', claimId: c.id, bookingId: b.id });
    else if (expected.get(key)?.bookingId !== c.bookingId) {
      issues.push({ code: 'UNEXPECTED_CLAIM', claimId: c.id, bookingId: b.id });
    }
  }
  for (const payment of payments) {
    if (!byId.has(payment.bookingId)) issues.push({ code: 'ORPHAN_PAYMENT', bookingId: payment.bookingId });
  }
  const missingClaims = [...expected].filter(([key, c]) => actual.get(key)?.bookingId !== c.bookingId).map(([, c]) => c);
  return { bookingCount: bookings.length, claimCount: claims.length, expectedClaimCount: expected.size, missingClaims, issues };
}

async function backfillMissingClaims(prisma) {
  const before = await auditClaims(prisma);
  if (before.issues.length) throw new BookingError(409, 'CLAIMS_REPAIR_BLOCKED', 'Resolve audit issues before adding missing claims.');
  const bookingIds = [...new Set(before.missingClaims.map((c) => c.bookingId))];
  let added = 0;
  for (const bookingId of bookingIds) {
    added += await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      const planned = before.missingClaims.filter((c) => c.bookingId === bookingId);
      if (!booking || !holdsNights.has(booking.status)) {
        throw new BookingError(409, 'CLAIMS_REPAIR_BLOCKED', 'Booking changed during backfill.');
      }
      const nights = validateStay(booking.checkInDate, booking.checkOutDate).nights;
      if (planned.some((c) => c.roomId !== booking.roomId || !nights.includes(c.night))) {
        throw new BookingError(409, 'CLAIMS_REPAIR_BLOCKED', 'Booking changed during backfill.');
      }
      const claims = await tx.roomNightClaim.findMany({ where: { roomId: booking.roomId, night: { in: nights } } });
      if (claims.some((c) => c.bookingId !== bookingId)) {
        throw new BookingError(409, 'CLAIMS_REPAIR_BLOCKED', 'Another booking owns these nights.');
      }
      const existing = new Set(claims.map((c) => c.night));
      const data = nights.filter((night) => !existing.has(night)).map((night) => ({ bookingId, roomId: booking.roomId, night }));
      if (data.length) await tx.roomNightClaim.createMany({ data });
      return data.length;
    });
  }
  const after = await auditClaims(prisma);
  if (after.issues.length || after.missingClaims.length) {
    throw new BookingError(409, 'CLAIMS_REPAIR_BLOCKED', 'Post-backfill audit failed; keep booking writes stopped.');
  }
  return { added, audit: after };
}

module.exports = { auditClaims, backfillMissingClaims };
