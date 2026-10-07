const { findAvailableRooms } = require('../services/availability-service');
const { testPrisma, seedStep2Sample } = require('./test-db');

const prisma = testPrisma();

beforeEach(async () => seedStep2Sample(prisma));
afterAll(async () => prisma.$disconnect());

test('Step 2 sample leaves only room 101 for 10–12 October', async () => {
  const rooms = await findAvailableRooms(prisma, {
    checkInDate: '2026-10-10', checkOutDate: '2026-10-12', guestCount: 2,
  });
  expect(rooms).toEqual([{
    roomId: '300000000000000000000001',
    roomNumber: '101', roomType: 'Standard', capacity: 2, pricePerNight: 1200,
  }]);
});

test('adjacent night is free and capacity filters rooms', async () => {
  const rooms = await findAvailableRooms(prisma, {
    checkInDate: '2026-10-12', checkOutDate: '2026-10-13', guestCount: 2,
  });
  expect(rooms.map((room) => room.roomNumber)).toEqual(['101', '305']);
  expect(await findAvailableRooms(prisma, {
    checkInDate: '2026-10-12', checkOutDate: '2026-10-13', guestCount: 4,
  })).toEqual([]);
});

test('inactive room and room type are excluded', async () => {
  await prisma.room.update({ where: { number: '101' }, data: { active: false } });
  await prisma.roomType.update({ where: { nameKey: 'deluxe' }, data: { active: false } });
  expect(await findAvailableRooms(prisma, {
    checkInDate: '2026-10-12', checkOutDate: '2026-10-13', guestCount: 2,
  })).toEqual([]);
});
