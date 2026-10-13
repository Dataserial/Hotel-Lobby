const {test}=require('node:test');const assert=require('node:assert/strict');
const {domApp}=require('./helpers/dom.cjs');
test('hotel automatically shows photographed room-type counts and an alternative date searches the complete stay',{timeout:180000},async()=>{
  const {startDatabase}=require('../../server/tests/task3-db');const {createApp}=require('../../server/app');const {createBooking}=require('../../server/services/booking-service');const {hotelToday}=require('../../server/services/stay-service');
  const db=await startDatabase('hotel_lobby_task5_test');let server,h;
  try{
    const actor=await db.prisma.user.create({data:{name:'Actor',email:'summary-dom@example.test',passwordHash:'unused',role:'admin'}});
    const guest=await db.prisma.guest.create({data:{fullName:'Guest',phone:'0812345678',documentNo:'DOM-SUMMARY',documentNoKey:'dom-summary'}});
    const type=await db.prisma.roomType.create({data:{name:'Standard',nameKey:'standard',capacity:2,basePrice:1200,amenities:['Wi-Fi']}});
    const rooms=[];for(let i=0;i<2;i++)rooms.push(await db.prisma.room.create({data:{number:'DOM-'+i,roomTypeId:type.id,active:true,status:'available'}}));
    const date=hotelToday(new Date()),next=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
    await createBooking(db.prisma,{guestId:guest.id,roomId:rooms[0].id,guestCount:2,checkInDate:date,checkOutDate:next},actor.id);
    server=createApp(db.prisma).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    h=domApp('http://localhost:5173/#discover',{VITE_API_BASE_URL:'http://127.0.0.1:'+server.address().port+'/api'});
    const PublicHotel=h.loadSource('PublicHotel.tsx').default;await h.React.act(async()=>h.root.render(h.React.createElement(PublicHotel,{staff(){}})));
    const doc=h.dom.window.document;assert.ok(doc.querySelector('.availability-panel'),'availability must appear before pressing search');
    await h.waitFor(()=>doc.querySelector('.room-type-card'));
    const card=doc.querySelector('.room-type-card');assert.equal(card.querySelector('img').getAttribute('src'),'/rooms/standard.png');
    assert.ok(card.textContent.includes('Standard'));assert.ok(card.textContent.includes('เหลือ 1 ห้อง'));assert.ok(card.textContent.includes('สูงสุด 2 คนต่อห้อง'));assert.ok(card.textContent.includes('1,200'));
    assert.equal(card.querySelectorAll('.date-chip').length,7);
    const alternative=card.querySelectorAll('.date-chip')[1];await h.React.act(async()=>alternative.click());
    await h.waitFor(()=>doc.querySelector('.public-room-card'));
    assert.equal(doc.querySelector('input[type="date"]').value,next);
    assert.ok(doc.querySelector('.pagination').textContent.includes('พบ 2 ห้อง'));
    assert.equal(doc.querySelector('.public-room-card img').getAttribute('src'),'/rooms/standard.png');
    await h.waitFor(()=>doc.querySelector('.room-type-card').textContent.includes('เหลือ 2 ห้อง'));
    await h.React.act(async()=>doc.querySelector('.public-room-card .primary').click());
    assert.ok(doc.querySelector('.contact-dialog[open]'));assert.ok(doc.querySelector('.contact-dialog').textContent.includes('Standard'));
  }finally{if(h)await h.close();if(server)await new Promise(r=>server.close(r));await db.stop()}
});
