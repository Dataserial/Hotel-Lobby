const {test}=require('node:test');const assert=require('node:assert/strict');
const {domApp}=require('./helpers/dom.cjs');

test('category selector has no alternative-date controls and filters paginated results',{timeout:180000},async()=>{
  const {startDatabase}=require('../../server/tests/task3-db');const {createApp}=require('../../server/app');
  const db=await startDatabase('hotel_lobby_task5_test');let server;
  try{
    const types=[];
    for(const [name,capacity,basePrice] of [['Standard',2,1200],['Deluxe',2,1800],['Family',4,2600]]){
      const type=await db.prisma.roomType.create({data:{name,nameKey:name.toLowerCase(),capacity,basePrice,amenities:[]}});types.push(type);
      for(let i=0;i<13;i++)await db.prisma.room.create({data:{number:types.length+'-'+String(i).padStart(2,'0'),roomTypeId:type.id,status:'available',active:true}});
    }
    server=createApp(db.prisma).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const base='http://127.0.0.1:'+server.address().port+'/api/public/rooms/availability?checkInDate=2027-01-01&checkOutDate=2027-01-03&guestCount=2&limit=12';
    for(const type of types){
      for(const page of [1,2]){
        const response=await fetch(base+'&roomTypeId='+type.id+'&page='+page);
        assert.equal(response.status,200,'selected room-type filter must be accepted');
        const data=await response.json();assert.equal(data.total,13);assert.equal(data.items.length,page===1?12:1);
        assert.ok(data.items.every(room=>room.roomType===type.name));
      }
    }
    assert.equal((await (await fetch(base)).json()).total,39,'unfiltered searches remain supported');
    assert.equal((await fetch(base+'&roomTypeId=invalid')).status,400);
    assert.equal((await fetch(base+'&roomTypeId='+types[0].id+'&roomTypeId='+types[1].id)).status,400);
    assert.equal((await (await fetch(base+'&roomTypeId=000000000000000000000000')).json()).total,0);
    assert.equal((await (await fetch(base.replace('guestCount=2','guestCount=4')+'&roomTypeId='+types[1].id)).json()).total,0);
  }finally{if(server)await new Promise(r=>server.close(r));await db.stop()}
});

test('discover waits for dates, then type, then room number',{timeout:180000},async()=>{
  const {startDatabase}=require('../../server/tests/task3-db');const {createApp}=require('../../server/app');
  const db=await startDatabase('hotel_lobby_task5_test');let server,h;
  try {
    const type=await db.prisma.roomType.create({data:{name:'Standard',nameKey:'standard',capacity:2,basePrice:1200,amenities:['Wi-Fi']}});
    await db.prisma.room.create({data:{number:'101',roomTypeId:type.id,active:true,status:'available'}});
    await db.prisma.room.create({data:{number:'102',roomTypeId:type.id,active:true,status:'maintenance'}});
    server=createApp(db.prisma).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    h=domApp('http://localhost:5173/discover',{VITE_API_BASE_URL:'http://127.0.0.1:'+server.address().port+'/api'});
    const user=await db.prisma.user.create({data:{name:'Grid Customer',email:'grid@example.test',role:'customer',passwordHash:await require('../../server/node_modules/bcryptjs').hash('grid-password-123',4)}});
    const login=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:'grid-password-123'})});const token=(await login.json()).token;
    const PublicHotel=h.loadSource('PublicHotel.tsx').default;await h.React.act(async()=>h.root.render(h.React.createElement(PublicHotel,{staff(){},member(){},user,token}))); 
    const doc=h.dom.window.document;assert.equal(doc.querySelector('.availability-search select'),null);assert.equal(doc.querySelectorAll('.room-type-card').length,0);
    await h.React.act(async()=>doc.querySelector('.availability-search').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true})));
    await h.waitFor(()=>doc.querySelector('.room-type-card'));
    assert.equal(doc.querySelectorAll('.room-number').length,0);
    await h.React.act(async()=>h.button('เลือก Standard').click());await h.waitFor(()=>doc.querySelectorAll('.room-number').length===2);
    assert.equal(doc.querySelectorAll('.room-number:disabled').length,1);
    await h.React.act(async()=>doc.querySelector('.room-number:not(:disabled)').click());
    assert.ok(doc.querySelector('.booking-confirm').textContent.includes('ชำระที่โรงแรม'));
    const fields=doc.querySelectorAll('.booking-confirm input');await h.input(fields[0],'0812345678');await h.input(fields[1],'GRID-PASSPORT-123');
    await h.React.act(async()=>doc.querySelector('.booking-confirm form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true})));await h.waitFor(()=>doc.body.textContent.includes('จองสำเร็จ'));
    assert.equal(await db.prisma.booking.count({where:{customerId:user.id}}),1);
    assert.ok(!h.dom.window.sessionStorage.getItem('hotel-lobby-booking-draft'));
  }finally{if(h)await h.close();if(server)await new Promise(r=>server.close(r));await db.stop()}
});
