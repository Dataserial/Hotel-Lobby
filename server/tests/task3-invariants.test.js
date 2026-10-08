const { ObjectId } = require('mongodb');
const { assertTestUrl, startDatabase, expectConsistent, sample } = require('./task3-db');

let db;
beforeAll(async () => { db = await startDatabase(); }, 180000);
beforeEach(async () => db.reset());
afterAll(async () => { if (db) await db.stop(); }, 30000);

test('database guard rejects production, remote hosts and standalone URLs', () => {
  for (const url of [
    'mongodb://127.0.0.1:27018/hotel_lobby?replicaSet=rs0',
    'mongodb://example.com:27018/hotel_lobby_task3_test?replicaSet=rs0',
    'mongodb://127.0.0.1:27018/hotel_lobby_task3_test',
    'mongodb://127.0.0.1:27018/hotel_lobby_task3_test_extra?replicaSet=rs0',
  ]) expect(() => assertTestUrl(url)).toThrow();
});

test('sample and checked-out bookings retain exactly their original nights', async () => {
  await expectConsistent(db.prisma);
  await db.prisma.booking.update({ where: { id: sample.bookings[0]._id }, data: { status: 'checked_out' } });
  await expectConsistent(db.prisma);
});

test('MongoDB has and enforces unique room-night and payment indexes', async () => {
  const raw = db.raw.db('hotel_lobby_task3_test');
  const claims = raw.collection('roomNightClaims');
  expect(await claims.listIndexes().toArray()).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: { roomId: 1, night: 1 }, unique: true }),
    expect.objectContaining({ key: { bookingId: 1 } }),
  ]));
  expect(await raw.collection('payments').listIndexes().toArray()).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: { bookingId: 1 }, unique: true }),
  ]));
  const original = await claims.findOne({});
  await expect(claims.insertOne({ ...original, _id: new ObjectId() })).rejects.toMatchObject({ code: 11000 });
  const payment = await raw.collection('payments').findOne({});
  await expect(raw.collection('payments').insertOne({ ...payment, _id: new ObjectId() })).rejects.toMatchObject({ code: 11000 });
  await expectConsistent(db.prisma);
});
