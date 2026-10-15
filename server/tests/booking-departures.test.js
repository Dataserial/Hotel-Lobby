// ทดสอบรายการเข้าออกตามวันที่จริง
const express = require('express');
const request = require('supertest');
const bookings = require('../routes/api-bookings');
const { errors } = require('../lib/http');

let app, model;
beforeEach(() => {
  model = { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([{ id: 'departed', status: 'checked_out' }]) };
  app = express();
  app.use((req, _res, next) => { req.actor = { role: 'receptionist' }; next(); });
  app.use('/bookings', bookings({ booking: model }));
  app.use(errors);
});

test('departure filter includes checked-out bookings without imposing a status', async () => {
  const response = await request(app).get('/bookings').query({ checkOutFrom: '2026-10-09', checkOutTo: '2026-10-09', page: 2, limit: 100 }).expect(200);
  expect(response.body.items[0].status).toBe('checked_out');
  expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { checkOutDate: { gte: '2026-10-09', lte: '2026-10-09' } }, skip: 100, take: 100 }));
});

test('daily activity includes scheduled stays and actual early checkout using Bangkok midnight', async () => {
  await request(app).get('/bookings').query({ activityDate: '2026-10-14' }).expect(200);
  const today = { gte: new Date('2026-10-13T17:00:00Z'), lt: new Date('2026-10-14T17:00:00Z') };
  expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [
    { checkInDate: '2026-10-14' }, { checkOutDate: '2026-10-14' },
    { actualCheckInAt: today }, { actualCheckOutAt: today },
  ] } }));
});

test.each([
  { checkOutFrom: '2026-02-30' },
  { activityDate: '2026-02-30' },
  { activityDate: 'bad-date' },
  { checkOutTo: 'invalid' },
  { checkOutFrom: '2026-10-10', checkOutTo: '2026-10-09' },
])('rejects invalid departure filters %j', async query => {
  await request(app).get('/bookings').query(query).expect(400);
  expect(model.findMany).not.toHaveBeenCalled();
});
