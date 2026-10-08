const { fail, objectId } = require('../lib/http');

async function assertActor(tx, actorId) {
  objectId(actorId, 'actorId');
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { active: true, role: true } });
  if (!actor?.active || !['admin', 'receptionist'].includes(actor.role)) fail(403, 'INVALID_ACTOR', 'Active staff member required');
}

async function operationTransaction(prisma, operation) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await prisma.$transaction(operation); }
    catch (error) {
      if (error.code !== 'P2034') throw error;
      if (attempt === 3) fail(409, 'WRITE_CONFLICT', 'Concurrent update conflict; retry the request');
      await new Promise((resolve) => setTimeout(resolve, attempt * 10));
    }
  }
}

// A real write to the shared booking document prevents snapshot write skew between
// payment, cancellation, repricing and stay operations. Explicit set handles old
// MongoDB documents where the version field is missing (Prisma reads default 0).
async function touchBooking(tx, booking, actorId) {
  return tx.booking.update({ where: { id: booking.id }, data: { version: booking.version + 1, updatedById: actorId } });
}

module.exports = { assertActor, operationTransaction, touchBooking };
