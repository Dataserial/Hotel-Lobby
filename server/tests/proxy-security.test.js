// ทดสอบIP และพร็อกซีที่เชื่อถือได้
const request=require('supertest');
const {createApp}=require('../app');
test('explicit trusted proxy separates IP quotas and recognizes forwarded HTTPS',async()=>{
  const app=createApp({}, {trustedProxyCidrs:'127.0.0.1/32,::1/128'});
  await request(app).get('/health').set('X-Forwarded-Proto','https').expect('Strict-Transport-Security','max-age=31536000').expect(200);
  for(let i=1;i<=21;i++) await request(app).post('/api/auth/login').set('X-Forwarded-For',`198.51.100.${i}`).send({}).expect(400);
});
test('unsafe proxy configuration is rejected rather than trusting all clients',()=>{
  for(const value of ['true','1','0.0.0.0/0','::/0']) expect(()=>createApp({}, {trustedProxyCidrs:value})).toThrow('TRUSTED_PROXY_CIDRS');
});
test('untrusted socket cannot spoof its quota or HTTPS through forwarded headers',async()=>{
  const app=createApp({}, {trustedProxyCidrs:'10.0.0.1/32'});
  const health=await request(app).get('/health').set('X-Forwarded-Proto','https').expect(200);
  expect(health.headers['strict-transport-security']).toBeUndefined();
  for(let i=1;i<=20;i++) await request(app).post('/api/auth/login').set('X-Forwarded-For',`198.51.100.${i}`).send({}).expect(400);
  await request(app).post('/api/auth/login').set('X-Forwarded-For','203.0.113.22').send({}).expect(429);
});
