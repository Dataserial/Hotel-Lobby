// ทดสอบหน้าสมาชิก สมัครบัญชี และแก้ข้อมูลผ่าน DOM
const {test}=require('node:test');const assert=require('node:assert/strict');
const {domApp}=require('./helpers/dom.cjs');

test('logged-in hotel header shows member identity and logout instead of guest login',async()=>{
  const h=domApp();try{
    const PublicHotel=h.loadSource('PublicHotel.tsx').default;const user={id:'member-fixture',name:'Member Fixture',email:'member@example.test',role:'customer',active:true};let logouts=0,accountOpened=0;
    await h.React.act(async()=>h.root.render(h.React.createElement(PublicHotel,{staff(){},member(){accountOpened++},user,logout(){logouts++}})));
    const header=h.dom.window.document.querySelector('.hotel-header');
    assert.ok(header.classList.contains('floating-navbar'));
    assert.equal(header.parentElement.className,'public-hotel');
    await h.openAccount();
    assert.ok(header.textContent.includes('Member Fixture'));
    assert.ok(header.textContent.includes('เข้าสู่ระบบแล้ว'));
    assert.ok(!header.textContent.includes('สมัครสมาชิก / เข้าสู่ระบบ'));
    const account=h.button('บัญชีสมาชิก');assert.ok(account);
    await h.React.act(async()=>account.click());assert.equal(accountOpened,1);
    await h.openAccount();
    await h.React.act(async()=>h.button('ออกจากระบบ').click());assert.equal(logouts,1);
    assert.ok(h.dom.window.document.querySelector('.availability-search'));
  }finally{await h.close()}
});

test('real signup, profile update, hotel navigation, logout and relogin keep correct account state', {timeout:180000}, async()=>{
  const {startDatabase}=require('../../server/tests/task3-db');const {createApp}=require('../../server/app');
  const db=await startDatabase('hotel_lobby_task5_test');let server,h;
  try {
    await db.reset();server=createApp(db.prisma).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    h=domApp('http://localhost:5173/#register',{VITE_API_BASE_URL:'http://127.0.0.1:'+server.address().port+'/api'});
    const App=h.loadSource('App.tsx').default;await h.React.act(async()=>h.root.render(h.React.createElement(App)));
    const doc=h.dom.window.document;
    await h.input(doc.querySelector('input[autocomplete="name"]'),'DOM Member');
    await h.input(doc.querySelector('input[type="email"]'),'dom-member@example.test');
    const passwords=doc.querySelectorAll('input[type="password"]');
    await h.input(passwords[0],'dom-member-password-123');await h.input(passwords[1],'dom-member-password-123');
    await h.React.act(async()=>doc.querySelector('.login-card').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true})));
    await h.waitFor(()=>doc.querySelector('.member-card'));
    assert.equal((await db.prisma.user.findUnique({where:{email:'dom-member@example.test'}})).role,'customer');
    await h.input(doc.querySelector('.member-card input[autocomplete="name"]'),'Updated Member');
    await h.React.act(async()=>h.button('บันทึกข้อมูล').click());await h.waitFor(()=>doc.body.textContent.includes('บันทึกข้อมูลสมาชิกแล้ว'));
    await h.React.act(async()=>h.button('ดูห้องพัก').click());await h.waitFor(()=>doc.querySelector('.hotel-header'));
    const header=doc.querySelector('.hotel-header');await h.openAccount();assert.ok(header.textContent.includes('Updated Member'));assert.ok(!header.textContent.includes('สมัครสมาชิก / เข้าสู่ระบบ'));
    await h.React.act(async()=>h.button('บัญชีสมาชิก').click());await h.waitFor(()=>doc.querySelector('.member-card'));
    await h.openAccount();
    await h.React.act(async()=>h.button('ออกจากระบบ').click());await h.waitFor(()=>doc.querySelector('.login-card'));
    assert.equal(await db.prisma.session.count({where:{userId:(await db.prisma.user.findUnique({where:{email:'dom-member@example.test'}})).id}}),0);
    await h.input(doc.querySelector('input[type="password"]'),'dom-member-password-123');
    await h.React.act(async()=>doc.querySelector('.login-card').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true})));
    await h.waitFor(()=>doc.querySelector('.member-card'));assert.ok(doc.body.textContent.includes('Updated Member'));
    await h.React.act(async()=>h.button('ดูห้องพัก').click());await h.waitFor(()=>doc.querySelector('.hotel-header'));
    await h.openAccount();
    assert.ok(doc.querySelector('.hotel-header').textContent.includes('เข้าสู่ระบบแล้ว'));
    await h.React.act(async()=>h.button('ออกจากระบบ').click());await h.waitFor(()=>h.button('สมัครสมาชิก / เข้าสู่ระบบ'));
  } finally {if(h)await h.close();if(server)await new Promise(r=>server.close(r));await db.stop()}
});
