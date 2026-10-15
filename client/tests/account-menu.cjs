// ทดสอบเมนูบัญชีและการเข้าสู่ระบบ
const {test}=require('node:test');const assert=require('node:assert/strict');
const {domApp}=require('./helpers/dom.cjs');
test('logged-in hotel account is an initials menu with profile and logout actions',async()=>{
  const h=domApp('http://localhost:5173/#discover');try{
    let profiles=0,logouts=0;
    const PublicHotel=h.loadSource('PublicHotel.tsx').default;
    await h.React.act(async()=>h.root.render(h.React.createElement(PublicHotel,{user:{id:'menu-user',name:'Pooh King',email:'menu@example.test',role:'customer',active:true},staff(){},member(){profiles++},logout(){logouts++}})));
    const doc=h.dom.window.document;const trigger=doc.querySelector('[data-account-trigger]');
    assert.ok(trigger,'account should be displayed as an avatar trigger');assert.equal(trigger.textContent.trim(),'PK');
    assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.ok(!doc.querySelector('[role="menu"]'));
    await h.React.act(async()=>trigger.click());assert.ok(doc.querySelector('[role="menu"]'));assert.equal(trigger.getAttribute('aria-expanded'),'true');
    assert.equal(doc.activeElement.textContent,'บัญชีสมาชิก');
    await h.React.act(async()=>doc.activeElement.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
    assert.equal(doc.activeElement.textContent,'ออกจากระบบ');
    await h.React.act(async()=>doc.activeElement.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(doc.activeElement,trigger);assert.ok(!doc.querySelector('[role="menu"]'));
    await h.React.act(async()=>trigger.click());await h.React.act(async()=>h.button('บัญชีสมาชิก').click());assert.equal(profiles,1);
    await h.React.act(async()=>trigger.click());await h.React.act(async()=>h.button('ออกจากระบบ').click());assert.equal(logouts,1);
    await h.React.act(async()=>trigger.click());await h.React.act(async()=>doc.body.dispatchEvent(new h.dom.window.Event('pointerdown',{bubbles:true})));
    assert.ok(!doc.querySelector('[role="menu"]'));
  }finally{await h.close()}
});
test('real wrong-password login displays no request ID and auth routes retain the shared navbar',{timeout:180000},async()=>{
  const {startDatabase}=require('../../server/tests/task3-db');const {createApp}=require('../../server/app');
  const db=await startDatabase('hotel_lobby_task5_test');let server,h;
  try{
    server=createApp(db.prisma).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    h=domApp('http://localhost:5173/#member',{VITE_API_BASE_URL:'http://127.0.0.1:'+server.address().port+'/api'});
    const App=h.loadSource('App.tsx').default;await h.React.act(async()=>h.root.render(h.React.createElement(App)));
    const doc=h.dom.window.document;assert.ok(doc.querySelector('.auth-header.floating-navbar'));
    await h.input(doc.querySelector('input[type="email"]'),'wrong@example.test');await h.input(doc.querySelector('input[type="password"]'),'wrong-password-123');
    await h.React.act(async()=>doc.querySelector('.login-card').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true})));
    await h.waitFor(()=>doc.querySelector('[role="alert"]'));
    assert.equal(doc.querySelector('[role="alert"]').textContent,'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    await h.React.act(async()=>h.button('ยังไม่มีบัญชี? สมัครสมาชิก').click());await h.waitFor(()=>doc.querySelector('input[autocomplete="name"]'));
    assert.ok(doc.querySelector('.auth-header.floating-navbar'));
    await h.React.act(async()=>doc.querySelector('.login-brand').click());await h.waitFor(()=>doc.querySelector('.home-header.floating-navbar'));
    await h.waitFor(()=>doc.querySelector('.home-stat-grid'));
  }finally{if(h)await h.close();if(server)await new Promise(resolve=>server.close(resolve));await db.stop()}
});
