// ทดสอบหน้าแรกและสิทธิ์เมนูของพนักงาน
const {test}=require('node:test');const assert=require('node:assert/strict');
const {domApp}=require('./helpers/dom.cjs');
test('first visit shows real overview and every public, member and staff logo returns home without losing the session',{timeout:180000},async()=>{
  const {startDatabase}=require('../../server/tests/task3-db');const {createApp}=require('../../server/app');const bcrypt=require('../../server/node_modules/bcryptjs');
  const db=await startDatabase('hotel_lobby_task5_test');let server,h;
  try{
    const type=await db.prisma.roomType.create({data:{name:'DOM Garden',nameKey:'dom garden',capacity:2,basePrice:1350,amenities:['Wi-Fi']}});
    await db.prisma.room.create({data:{number:'HOME-1',roomTypeId:type.id,floor:1,status:'available',active:true}});
    await db.prisma.user.create({data:{name:'DOM Admin',email:'home-admin@example.test',passwordHash:await bcrypt.hash('homepage-admin-123',10),role:'admin'}});
    server=createApp(db.prisma).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    h=domApp('http://localhost:5173/',{VITE_API_BASE_URL:'http://127.0.0.1:'+server.address().port+'/api'});
    const App=h.loadSource('App.tsx').default;await h.React.act(async()=>h.root.render(h.React.createElement(App)));
    const doc=h.dom.window.document;assert.ok(doc.querySelector('.home-page'),'root URL must start at homepage, not moon introduction');
    await h.waitFor(()=>doc.querySelector('.home-room-card'));
    assert.ok(doc.body.textContent.includes('DOM Garden'));assert.ok(doc.body.textContent.includes('1,350'));
    assert.equal(doc.querySelector('[data-stat="available"]').textContent,'1');assert.equal(doc.querySelector('[data-stat="booked"]').textContent,'0');
    await h.React.act(async()=>h.button('ค้นหาห้องพัก').click());await h.waitFor(()=>doc.querySelector('.hotel-header'));
    await h.React.act(async()=>doc.querySelector('.hotel-header .home-link').click());await h.waitFor(()=>doc.querySelector('.home-page'));
    await h.React.act(async()=>h.button('สำหรับพนักงาน').click());await h.waitFor(()=>doc.querySelector('.login-card'));
    await h.React.act(async()=>doc.querySelector('.login-brand').click());await h.waitFor(()=>doc.querySelector('.home-page'));
    await h.React.act(async()=>h.button('สำหรับพนักงาน').click());await h.waitFor(()=>doc.querySelector('.login-card'));
    await h.input(doc.querySelector('input[type="email"]'),'home-admin@example.test');await h.input(doc.querySelector('input[type="password"]'),'homepage-admin-123');
    await h.React.act(async()=>doc.querySelector('.login-card').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true})));
    await h.waitFor(()=>doc.querySelector('.sidebar'));
    assert.ok(doc.querySelector('.topbar.floating-navbar'));
    await h.React.act(async()=>doc.querySelector('.sidebar .home-link').click());await h.waitFor(()=>doc.querySelector('.home-page'));
    await h.openAccount();
    assert.ok(doc.querySelector('.home-header').textContent.includes('DOM Admin'));
    await h.React.act(async()=>h.button('ระบบพนักงาน').click());await h.waitFor(()=>doc.querySelector('.sidebar'));
    assert.equal(await db.prisma.session.count(),1);
    // หน้าบัญชีลูกค้ากลับหน้าแรกผ่านลิงก์ร่วมโดยยังเข้าสู่ระบบอยู่
    await h.openAccount();await h.React.act(async()=>h.button('ออกจากระบบ').click());await h.waitFor(()=>doc.querySelector('.login-card'));
    await h.React.act(async()=>doc.querySelector('.login-brand').click());await h.waitFor(()=>doc.querySelector('.home-page'));
    await h.React.act(async()=>h.button('สมัครสมาชิก').click());await h.waitFor(()=>doc.querySelector('input[autocomplete="name"]'));
    await h.input(doc.querySelector('input[autocomplete="name"]'),'Home Member');await h.input(doc.querySelector('input[type="email"]'),'home-member@example.test');
    for(const input of doc.querySelectorAll('input[type="password"]'))await h.input(input,'homepage-member-123');
    await h.React.act(async()=>doc.querySelector('.login-card').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true})));
    await h.waitFor(()=>doc.querySelector('.member-page'));
    assert.ok(doc.querySelector('.member-header.floating-navbar'));
    await h.React.act(async()=>doc.querySelector('.member-page .home-link').click());await h.waitFor(()=>doc.querySelector('.home-page'));
    await h.openAccount();
    assert.ok(doc.querySelector('.home-header').textContent.includes('Home Member'));
    await h.React.act(async()=>h.button('บัญชีสมาชิก').click());await h.waitFor(()=>doc.querySelector('.member-page'));
  }finally{if(h)await h.close();if(server)await new Promise(r=>server.close(r));await db.stop()}
});
