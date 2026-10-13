const {test}=require('node:test');const assert=require('node:assert/strict');
const {domApp}=require('./helpers/dom.cjs');
const member=(name,id='first')=>({id,name,email:id+'@example.test',role:'customer',active:true});

async function login(h) {
  const doc=h.dom.window.document;
  await h.input(doc.querySelector('input[type="email"]'),'member@example.test');
  await h.input(doc.querySelector('input[type="password"]'),'member-password-123');
  await h.React.act(async()=>doc.querySelector('.login-card').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true})));
  await h.waitFor(()=>doc.querySelector('.member-card'));
}

for(const replacement of [false,true]) test('deferred profile save cannot '+(replacement?'replace a new login':'restore a logged-out member'),async()=>{
  const originalFetch=globalThis.fetch;const h=domApp('http://localhost:5173/#member');
  let completeProfile,profileSignal,loginCount=0;
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/auth/login'))return Response.json({token:'token-'+(++loginCount),expiresIn:3600,user:member(loginCount===1?'First Member':'Second Member',loginCount===1?'first':'second')});
    if(url.endsWith('/auth/logout'))return new Response(null,{status:204});
    if(url.endsWith('/auth/profile')){profileSignal=options.signal;return new Promise(resolve=>{completeProfile=()=>resolve(Response.json({user:member('Stale Profile')}))})}
    throw new Error('Unexpected URL '+url);
  };
  try {
    const App=h.loadSource('App.tsx').default;await h.React.act(async()=>h.root.render(h.React.createElement(App)));await login(h);
    await h.input(h.dom.window.document.querySelector('input[autocomplete="name"]'),'Stale Profile');
    await h.React.act(async()=>h.dom.window.document.querySelector('.member-card form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true})));
    assert.ok(completeProfile);assert.equal(profileSignal.aborted,false);
    await h.openAccount();await h.React.act(async()=>h.button('ออกจากระบบ').click());await h.waitFor(()=>h.dom.window.document.querySelector('.login-card'));
    if(replacement)await login(h);
    await h.React.act(async()=>{completeProfile();await new Promise(resolve=>setImmediate(resolve))});
    if(replacement){assert.ok(h.dom.window.document.querySelector('.member-card').textContent.includes('Second Member'));assert.ok(!h.dom.window.document.body.textContent.includes('Stale Profile'))}
    else {assert.ok(h.dom.window.document.querySelector('.login-card'));assert.equal(h.dom.window.document.querySelector('.member-card'),null)}
    assert.equal(profileSignal.aborted,true);
  }finally{await h.close();globalThis.fetch=originalFetch}
});

test('stale member update callback cannot overwrite the replacement session',async()=>{
  const originalFetch=globalThis.fetch;const h=domApp('http://localhost:5173/#member');let loginCount=0,staleUpdated;
  globalThis.fetch=async(url)=>{
    if(url.endsWith('/auth/login'))return Response.json({token:'token-'+(++loginCount),expiresIn:3600,user:member(loginCount===1?'First Member':'Second Member',loginCount===1?'first':'second')});
    if(url.endsWith('/auth/logout'))return new Response(null,{status:204});
    throw new Error('Unexpected URL '+url);
  };
  try {
    const module=h.loadSource('MemberAccount.tsx');const MemberAccount=module.default;
    module.default=props=>{if(!staleUpdated)staleUpdated=props.updated;return h.React.createElement(MemberAccount,props)};
    const App=h.loadSource('App.tsx').default;await h.React.act(async()=>h.root.render(h.React.createElement(App)));await login(h);
    await h.openAccount();await h.React.act(async()=>h.button('ออกจากระบบ').click());await h.waitFor(()=>h.dom.window.document.querySelector('.login-card'));await login(h);
    await h.React.act(async()=>staleUpdated(member('Stale Profile')));
    assert.ok(h.dom.window.document.querySelector('.member-card').textContent.includes('Second Member'));
    assert.ok(!h.dom.window.document.body.textContent.includes('Stale Profile'));
  }finally{await h.close();globalThis.fetch=originalFetch}
});

test('customer hotel staff callback logs out, opens staff login and its logo returns home',async()=>{
  const originalFetch=globalThis.fetch;const h=domApp('http://localhost:5173/#member');let logouts=0;
  globalThis.fetch=async(url)=>{
    if(url.endsWith('/auth/login'))return Response.json({token:'customer-token',expiresIn:3600,user:member('Customer Member')});
    if(url.endsWith('/auth/logout')){logouts++;return new Response(null,{status:204})}
    if(url.endsWith('/public/overview'))return Response.json({date:'2026-10-13',checkOutDate:'2026-10-14',timezone:'Asia/Bangkok',updatedAt:'2026-10-13T03:00:00Z',totalRooms:0,availableRooms:0,bookedRooms:0,roomTypes:[]});
    throw new Error('Unexpected URL '+url);
  };
  try {
    // The logged-in hotel hides its staff control; expose only the existing callback
    // at the test seam while keeping the real PublicHotel and React DOM mounted.
    const module=h.loadSource('PublicHotel.tsx');const PublicHotel=module.default;
    module.default=props=>h.React.createElement(h.React.Fragment,null,h.React.createElement(PublicHotel,props),h.React.createElement('button',{'data-test-staff':true,onClick:props.staff},'Test staff route'));
    const App=h.loadSource('App.tsx').default;await h.React.act(async()=>h.root.render(h.React.createElement(App)));await login(h);
    await h.React.act(async()=>h.button('ดูห้องพัก').click());await h.waitFor(()=>h.dom.window.document.querySelector('.hotel-header'));
    await h.React.act(async()=>h.dom.window.document.querySelector('[data-test-staff]').click());
    await h.waitFor(()=>h.dom.window.document.querySelector('.login-card'),500);
    assert.equal(logouts,1);assert.ok(h.dom.window.document.querySelector('.login-card').textContent.includes('Admin และ Receptionist'));
    await h.React.act(async()=>h.dom.window.document.querySelector('.login-brand').click());await h.waitFor(()=>h.dom.window.document.querySelector('.home-page'));
    assert.equal(h.dom.window.location.hash,'#home');assert.ok(!h.dom.window.document.querySelector('.home-header').textContent.includes('Customer Member'));
  }finally{await h.close();globalThis.fetch=originalFetch}
});
