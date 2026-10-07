const { PrismaClient } = require('@prisma/client');
const sample = require('../../docs/step2-sample-data.json');

function testPrisma() {
  const url = process.env.DATABASE_URL;
  if (!url || !/^mongodb:\/\/127\.0\.0\.1:\d+\/hotel_lobby_step9_test(?:\?|$)/.test(url)) {
    throw new Error('Integration tests require DATABASE_URL for local hotel_lobby_step9_test.');
  }
  return new PrismaClient();
}

async function resetTestDatabase(prisma) {
  await prisma.roomNightClaim.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.room.deleteMany();
  await prisma.roomType.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.user.deleteMany();
}

function dates(row, fields) {
  const result = { ...row, id: row._id };
  delete result._id;
  for (const field of fields) {
    if (result[field]) result[field] = new Date(result[field]);
  }
  return result;
}

async function seedStep2Sample(prisma) {
  await resetTestDatabase(prisma);
  await prisma.user.createMany({ data: sample.users.map((row) => dates(row, ['createdAt', 'updatedAt'])) });
  await prisma.roomType.createMany({ data: sample.roomTypes.map((row) => {
    const data = dates(row, ['createdAt', 'updatedAt']);
    delete data.createdById;
    delete data.updatedById;
    return data;
  }) });
  await prisma.room.createMany({ data: sample.rooms.map((row) => {
    const data = dates(row, ['createdAt', 'updatedAt']);
    data.number = data.roomNumber;
    delete data.roomNumber;
    delete data.createdById;
    delete data.updatedById;
    return data;
  }) });
  await prisma.guest.createMany({ data: sample.guests.map((row) => {
    const data = dates(row, ['createdAt', 'updatedAt']);
    delete data.createdById;
    delete data.updatedById;
    return data;
  }) });
  await prisma.booking.createMany({ data: sample.bookings.map((row) =>
    dates(row, ['actualCheckInAt', 'actualCheckOutAt', 'cancelledAt', 'createdAt', 'updatedAt'])) });
  await prisma.payment.createMany({ data: sample.payments.map((row) =>
    dates(row, ['paidAt', 'refundedAt', 'createdAt', 'updatedAt'])) });
  await prisma.roomNightClaim.createMany({ data: sample.roomNightClaims.map((row) =>
    dates(row, ['createdAt'])) });
}

module.exports = { testPrisma, resetTestDatabase, seedStep2Sample, sample };
