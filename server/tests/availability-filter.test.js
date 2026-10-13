const express = require('express');
const request = require('supertest');
const { errors } = require('../lib/http');
const typeId = '200000000000000000000001';
const base = { checkInDate: '2026-10-14', checkOutDate: '2026-10-15', guestCount: 2, page: 1, limit: 12 };
let app, prisma;
beforeEach(() => {
  prisma = {
    room: { findMany: jest.fn(async ({ where }) => Array.from({ length: where.roomTypeId === typeId ? 20 : 60 }, (_, i) => ({
      id: String(i), number: String(101 + i), active: true, status: 'available',
      roomType: { name: 'Standard', active: true, capacity: 2, basePrice: 1200 },
    }))) },
    roomNightClaim: { findMany: jest.fn().mockResolvedValue([]) },
  };
  app = express();
  app.use('/availability', require('../routes/api-availability')(prisma, { publicAccess: true }));
  app.use(errors);
});
test('selected room type is filtered before pagination and totals', async () => {
  const response = await request(app).get('/availability').query({ ...base, roomTypeId: typeId, page: 2 });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ page: 2, total: 20, limit: 12 });
  expect(response.body.items).toHaveLength(8);
  expect(prisma.room.findMany.mock.calls[0][0].where.roomTypeId).toBe(typeId);
});
test('unfiltered searches retain all room types', async () => {
  const response = await request(app).get('/availability').query(base);
  expect(response.status).toBe(200);
  expect(response.body.total).toBe(60);
});
test.each(['invalid', '', [typeId, typeId]])('invalid or repeated room type is rejected', async roomTypeId => {
  const response = await request(app).get('/availability').query({ ...base, roomTypeId });
  expect(response.status).toBe(400);
  expect(prisma.room.findMany).not.toHaveBeenCalled();
});
