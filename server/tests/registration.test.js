const request=require('supertest');
const {createApp}=require('../app');
const {startDatabase}=require('./task3-db');
let db,app;
const input={name:'Member Fixture',email:'member@example.test',password:'member-password-123'};
beforeAll(async()=>{db=await startDatabase('hotel_lobby_task5_test')},180000);
beforeEach(async()=>{await db.reset();app=createApp(db.prisma)});
afterAll(async()=>{if(db)await db.stop()},30000);
test('public registration creates a customer who can log in and view only their own account',async()=>{
  const registered=await request(app).post('/api/auth/register').send(input).expect(201);
  expect(registered.body.user).toMatchObject({name:input.name,email:input.email,role:'customer',active:true});
  expect(JSON.stringify(registered.body)).not.toContain('passwordHash');
  const login=(await request(app).post('/api/auth/login').send({email:input.email,password:input.password}).expect(200)).body;
  const auth={Authorization:`Bearer ${login.token}`};
  await request(app).get('/api/auth/me').set(auth).expect(200);
  for(const url of ['/api/guests','/api/rooms','/api/bookings','/api/users','/api/dashboard']) await request(app).get(url).set(auth).expect(403);
  await request(app).post('/api/auth/logout').set(auth).expect(204);
  await request(app).get('/api/auth/me').set(auth).expect(401);
});
