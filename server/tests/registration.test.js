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

test('registration cannot choose privileged roles and rejects duplicate or invalid credentials',async()=>{
  await request(app).post('/api/auth/register').send({...input,role:'admin'}).expect(400);
  await request(app).post('/api/auth/register').send({...input,password:'x'.repeat(73)}).expect(400);
  await request(app).post('/api/auth/register').send({...input,email:'not-an-email'}).expect(400);
  await request(app).post('/api/auth/register').send(input).expect(201);
  await request(app).post('/api/auth/register').send(input).expect(409);
  expect(await db.prisma.user.count({where:{email:input.email}})).toBe(1);
});

test('customer profile updates only its account and refuses role, password and duplicate email changes',async()=>{
  const crypto=require('crypto');const {hashToken}=require('../lib/auth');const {sample}=require('./task3-db');
  await request(app).post('/api/auth/register').send(input).expect(201);
  const second=(await request(app).post('/api/auth/register').send({...input,email:'other-member@example.test',name:'Other member'}).expect(201)).body.user;
  const login=(await request(app).post('/api/auth/login').send({email:input.email,password:input.password}).expect(200)).body;
  const auth={Authorization:`Bearer ${login.token}`};
  const result=(await request(app).patch('/api/auth/profile').set(auth).send({name:'Updated member',email:'updated-member@example.test'}).expect(200)).body;
  expect(result.user).toMatchObject({id:login.user.id,name:'Updated member',role:'customer'});
  expect((await db.prisma.user.findUnique({where:{id:second.id}})).name).toBe('Other member');
  for(const body of [{role:'admin'},{active:false},{password:'other-password-123'},{id:second.id,name:'Attack'}]) await request(app).patch('/api/auth/profile').set(auth).send(body).expect(400);
  await request(app).patch('/api/auth/profile').set(auth).send({email:second.email}).expect(409);
  const staffToken=crypto.randomBytes(32).toString('base64url');await db.prisma.session.create({data:{userId:sample.users[0]._id,tokenHash:hashToken(staffToken),expiresAt:new Date(Date.now()+3600000)}});
  await request(app).patch('/api/auth/profile').set({Authorization:`Bearer ${staffToken}`}).send({name:'Staff'}).expect(403);
});
