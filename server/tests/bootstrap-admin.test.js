// ทดสอบการสร้างผู้ดูแลเริ่มต้น
const {startDatabase}=require('./task3-db');
let db;
beforeAll(async()=>{db=await startDatabase('hotel_lobby_task5_test')},180000);
afterAll(async()=>{if(db)await db.stop()},30000);
test('initial-admin bootstrap requires an exact database and cannot reset or replace existing accounts',async()=>{
  let bootstrap;
  try {bootstrap=require('../scripts/bootstrap-admin')}catch {bootstrap={}}
  expect(typeof bootstrap.config).toBe('function');expect(typeof bootstrap.bootstrapAdmin).toBe('function');
  const env={DATABASE_URL:db.url,BOOTSTRAP_ADMIN_EMAIL:'first-admin@example.test',BOOTSTRAP_ADMIN_PASSWORD:'bootstrap-password-123'};
  expect(()=>bootstrap.config(env,['--database','wrong','--initial-admin'])).toThrow();
  expect(()=>bootstrap.config({...env,BOOTSTRAP_ADMIN_PASSWORD:'x'.repeat(73)},['--database','hotel_lobby_task5_test','--initial-admin'])).toThrow();
  const config=bootstrap.config(env,['--database','hotel_lobby_task5_test','--initial-admin']);
  const first=await bootstrap.bootstrapAdmin(db.prisma,config);expect(first.created).toBe(true);expect(first.user.role).toBe('admin');
  const hash=(await db.prisma.user.findUnique({where:{email:config.email}})).passwordHash;
  expect((await bootstrap.bootstrapAdmin(db.prisma,config)).created).toBe(false);
  expect((await db.prisma.user.findUnique({where:{email:config.email}})).passwordHash).toBe(hash);
  await expect(bootstrap.bootstrapAdmin(db.prisma,{...config,password:'changed-password-123'})).rejects.toThrow();
  await expect(bootstrap.bootstrapAdmin(db.prisma,{...config,email:'second-admin@example.test'})).rejects.toThrow();
  expect(await db.prisma.user.count()).toBe(1);
});
