// ทดสอบการสร้างห้องพักตัวอย่าง
const { seedRooms } = require('../scripts/seed-rooms');

function database(types = [], rooms = []) {
  return {
    roomType: {
      findMany: jest.fn(async () => types),
      upsert: jest.fn(async ({ create }) => { const type = { ...create, id: `type-${types.length}` }; types.push(type); return type; }),
    },
    room: {
      findMany: jest.fn(async () => rooms),
      create: jest.fn(async ({ data }) => { rooms.push(data); return data; }),
    },
    user: { findFirst: jest.fn(async () => ({ id: 'admin-id' })) },
  };
}
const options = { apply: true, log: () => {} };

test('empty inventory gets 60 rooms, three sample types, and repeat runs add nothing', async () => {
  const prisma = database();
  expect((await seedRooms(prisma, options)).created).toBe(60);
  expect(prisma.roomType.upsert).toHaveBeenCalledTimes(3);
  expect(prisma.room.create.mock.calls[0][0].data).toMatchObject({ number: '101', status: 'available', active: true, createdById: 'admin-id' });
  expect((await seedRooms(prisma, options)).created).toBe(0);
});

test('uses actual active types and preserves all existing rooms, including number collisions', async () => {
  const types = [{ id: 'suite', name: 'Suite', nameKey: 'suite', active: true, capacity: 5, basePrice: 9000 },
    { id: 'closed', name: 'Closed', active: false }];
  const occupied = { number: '101', roomTypeId: 'closed', status: 'occupied', active: false };
  const rooms = [occupied];
  const prisma = database(types, rooms);
  expect((await seedRooms(prisma, options)).created).toBe(19);
  expect(prisma.roomType.upsert).not.toHaveBeenCalled();
  expect(prisma.room.create.mock.calls.every(([{ data }]) => data.roomTypeId === 'suite')).toBe(true);
  expect(rooms[0]).toEqual(occupied);
  expect(types[0].basePrice).toBe(9000);
});

test('preview never writes or requires an admin', async () => {
  const prisma = database();
  await seedRooms(prisma, { log: () => {} });
  expect(prisma.room.create).not.toHaveBeenCalled();
  expect(prisma.roomType.upsert).not.toHaveBeenCalled();
  expect(prisma.user.findFirst).not.toHaveBeenCalled();
});

test('does not replace a disabled catalog with defaults', async () => {
  const prisma = database([{ name: 'Disabled', active: false }]);
  await expect(seedRooms(prisma, options)).rejects.toThrow('No active room types');
  expect(prisma.roomType.upsert).not.toHaveBeenCalled();
});

test('requires an active admin before any writes', async () => {
  const prisma = database();
  prisma.user.findFirst.mockResolvedValue(null);
  await expect(seedRooms(prisma, options)).rejects.toThrow('active admin');
  expect(prisma.roomType.upsert).not.toHaveBeenCalled();
});

test('skips concurrent duplicate numbers and propagates other database failures', async () => {
  const prisma = database([{ id: 'type', name: 'Existing', active: true }]);
  prisma.room.create.mockRejectedValueOnce({ code: 'P2002' });
  expect((await seedRooms(prisma, options)).created).toBe(19);
  prisma.room.create.mockRejectedValueOnce({ code: 'P1001' });
  await expect(seedRooms(prisma, options)).rejects.toEqual({ code: 'P1001' });
});
