// ทดสอบการแบ่งหน้าประวัติรับคืนเงิน
const request=require('supertest');const crypto=require('crypto');
const {createApp}=require('../app');const {hashToken}=require('../lib/auth');const {startDatabase,sample}=require('./task3-db');
let db,app,token;
beforeAll(async()=>{db=await startDatabase('hotel_lobby_task5_test')},180000);
afterAll(async()=>{if(db)await db.stop()},30000);
test('receipt search reaches old rows past page 100 and remains scoped to its booking',async()=>{
  await db.reset();app=createApp(db.prisma);token=crypto.randomBytes(32).toString('base64url');const actor=sample.users[0]._id;
  await db.prisma.session.create({data:{userId:actor,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});
  const auth={Authorization:`Bearer ${token}`};
  const booking=(await request(app).post('/api/bookings').set(auth).send({guestId:sample.guests[0]._id,roomId:sample.rooms[0]._id,guestCount:2,checkInDate:'2026-12-20',checkOutDate:'2026-12-21'}).expect(201)).body;
  for(let i=0;i<101;i++)await request(app).post(`/api/bookings/${booking.id}/payment/receipts`).set(auth).set('Idempotency-Key',`audit-history-${i}`).send({amount:1,method:'cash',reference:`AUDIT-HISTORY-${String(i).padStart(3,'0')}`,occurredAt:new Date().toISOString()}).expect(201);
  const base=`/api/bookings/${booking.id}/payment/transactions`;
  const first=(await request(app).get(base).set(auth).query({kind:'receive',limit:20}).expect(200)).body;expect(first.total).toBe(101);
  const old=(await request(app).get(base).set(auth).query({kind:'receive',q:'AUDIT-HISTORY-000',page:1,limit:20}).expect(200)).body;
  expect(old.total).toBe(1);expect(old.items[0].reference).toBe('AUDIT-HISTORY-000');
  const last=(await request(app).get(base).set(auth).query({kind:'receive',page:6,limit:20}).expect(200)).body;expect(last.items).toHaveLength(1);
  await request(app).get(base).set(auth).query({kind:'bad'}).expect(400);
  const other=(await request(app).get(`/api/bookings/${sample.bookings[0]._id}/payment/transactions`).set(auth).query({kind:'receive',q:'AUDIT-HISTORY'}).expect(200)).body;expect(other.total).toBe(0);
});
