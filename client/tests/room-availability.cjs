const {test}=require('node:test');const assert=require('node:assert/strict');
const {domApp}=require('./helpers/dom.cjs');
test('availability filters the selected room type before pagination',{timeout:180000},async()=>{
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
test('hotel automatically shows photographed room-type counts and an alternative date searches the complete stay',{timeout:180000},async()=>{
  const {startDatabase}=require('../../server/tests/task3-db');const {createApp}=require('../../server/app');const {createBooking}=require('../../server/services/booking-service');const {hotelToday}=require('../../server/services/stay-service');
  const db=await startDatabase('hotel_lobby_task5_test');let server,h;
  try{
    const actor=await db.prisma.user.create({data:{name:'Actor',email:'summary-dom@example.test',passwordHash:'unused',role:'admin'}});
    const guest=await db.prisma.guest.create({data:{fullName:'Guest',phone:'0812345678',documentNo:'DOM-SUMMARY',documentNoKey:'dom-summary'}});
    const type=await db.prisma.roomType.create({data:{name:'Standard',nameKey:'standard',capacity:2,basePrice:1200,amenities:['Wi-Fi']}});
    const rooms=[];for(let i=0;i<2;i++)rooms.push(await db.prisma.room.create({data:{number:'DOM-'+i,roomTypeId:type.id,active:true,status:'available'}}));
    for(const [name,capacity,basePrice,count] of [['Deluxe',2,1800,13],['Family',4,2600,1]]){
      const roomType=await db.prisma.roomType.create({data:{name,nameKey:name.toLowerCase(),capacity,basePrice,amenities:['Wi-Fi','Breakfast']}});
      for(let i=0;i<count;i++)await db.prisma.room.create({data:{number:name+'-'+String(i).padStart(2,'0'),roomTypeId:roomType.id,active:true,status:'available'}});
    }
    const date=hotelToday(new Date()),next=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
    await createBooking(db.prisma,{guestId:guest.id,roomId:rooms[0].id,guestCount:2,checkInDate:date,checkOutDate:next},actor.id);
    server=createApp(db.prisma).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    h=domApp('http://localhost:5173/#discover',{VITE_API_BASE_URL:'http://127.0.0.1:'+server.address().port+'/api'});
    const PublicHotel=h.loadSource('PublicHotel.tsx').default;await h.React.act(async()=>h.root.render(h.React.createElement(PublicHotel,{staff(){}})));
    const doc=h.dom.window.document;assert.ok(doc.querySelector('.availability-panel'),'availability must appear before pressing search');
    await h.waitFor(()=>doc.querySelector('.room-type-card'));
    assert.equal(doc.querySelectorAll('.availability-panel .room-type-card').length,1,'only the selected category is shown');
    assert.equal(doc.querySelectorAll('.room-type-selector button').length,3);
    const card=doc.querySelector('.room-type-card');assert.equal(card.querySelector('img').getAttribute('src'),'/rooms/standard.png');
    assert.ok(card.textContent.includes('Standard'));assert.ok(card.textContent.includes('เหลือ 1 ห้อง'));assert.ok(card.textContent.includes('สูงสุด 2 คนต่อห้อง'));assert.ok(card.textContent.includes('1,200'));
    assert.equal(card.querySelectorAll('.date-chip').length,7);
    const alternative=card.querySelectorAll('.date-chip')[1];await h.React.act(async()=>alternative.click());
    await h.waitFor(()=>doc.querySelector('.public-room-card'));
    assert.equal(doc.querySelector('input[type="date"]').value,next);
    assert.ok(doc.querySelector('.pagination').textContent.includes('พบ 2 ห้อง'));
    assert.equal(doc.querySelector('.public-room-card img').getAttribute('src'),'/rooms/standard.png');
    await h.waitFor(()=>doc.querySelector('.room-type-card')?.textContent.includes('เหลือ 2 ห้อง'));
    await h.React.act(async()=>doc.querySelector('.public-room-card .primary').click());
    assert.ok(doc.querySelector('.contact-dialog[open]'));assert.ok(doc.querySelector('.contact-dialog').textContent.includes('Standard'));
    await h.React.act(async()=>doc.querySelector('.contact-dialog .dialog-close').click());
    const selectType=async (name,available=name==='Deluxe'?13:1)=>{
      const button=Array.from(doc.querySelectorAll('.room-type-selector button')).find(button=>button.textContent===name);
      await h.React.act(async()=>button.click());
      assert.equal(button.getAttribute('aria-pressed'),'true');
      assert.equal(doc.querySelectorAll('.availability-panel .room-type-card').length,1);
      assert.equal(doc.querySelector('.room-type-card h3').textContent,name);
      assert.equal(doc.querySelector('.room-type-card img').getAttribute('src'),'/rooms/'+name.toLowerCase()+'.png');
      const banner=doc.querySelector('.availability-banner strong').textContent;
      assert.ok(available ? banner.includes(name+' · พบ '+available+' ห้อง') : banner.includes(name)&&banner.includes('ยังไม่มีห้อง'),'banner describes only the selected category');
    };
    const expectResults=async(name,total)=>{
      await h.waitFor(()=>doc.querySelector('.public-room-card')&&doc.querySelector('.public-results').getAttribute('aria-busy')==='false');
      assert.ok(Array.from(doc.querySelectorAll('.public-room-card h3')).every(heading=>heading.textContent===name));
      assert.ok(doc.querySelector('.pagination').textContent.includes('พบ '+total+' ห้อง'));
      await h.waitFor(()=>doc.querySelector('.room-type-card'));
      assert.equal(doc.querySelector('.room-type-card h3').textContent,name,'selection persists after summary refresh');
    };
    await selectType('Deluxe');assert.ok(doc.querySelector('.room-type-card').textContent.includes('1,800'));
    await h.React.act(async()=>h.button('ดูห้องว่างช่วงที่เลือก').click());await expectResults('Deluxe',13);
    await h.React.act(async()=>h.button('ถัดไป').click());await expectResults('Deluxe',13);
    assert.equal(doc.querySelectorAll('.public-room-card').length,1);assert.ok(doc.querySelector('.pagination').textContent.includes('หน้า 2'));
    await h.React.act(async()=>h.button('ก่อนหน้า').click());await expectResults('Deluxe',13);
    await h.React.act(async()=>doc.querySelectorAll('.room-type-card .date-chip')[1].click());await expectResults('Deluxe',13);
    await h.React.act(async()=>doc.querySelector('.availability-search').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true})));await expectResults('Deluxe',13);
    await selectType('Family');assert.ok(doc.querySelector('.room-type-card').textContent.includes('สูงสุด 4 คนต่อห้อง'));
    await h.React.act(async()=>h.button('ดูห้องว่างช่วงที่เลือก').click());await expectResults('Family',1);
    const guestCount=doc.querySelector('.availability-search select');
    await h.React.act(async()=>{guestCount.value='4';guestCount.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}))});
    await h.React.act(async()=>doc.querySelector('.availability-search').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true})));await expectResults('Family',1);
    await selectType('Deluxe',0);
    await h.React.act(async()=>doc.querySelector('.availability-search').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true})));
    await h.waitFor(()=>doc.querySelector('.public-results .public-empty')&&doc.querySelector('.public-results').getAttribute('aria-busy')==='false');
    await h.waitFor(()=>doc.querySelector('.room-type-card'));
    assert.equal(h.button('ดูห้องว่างช่วงที่เลือก').disabled,true);
    assert.equal(doc.querySelector('.room-type-card h3').textContent,'Deluxe');
    assert.equal(doc.querySelectorAll('.public-room-card').length,0,'a full or too-small category must not fall back to Standard');
  }finally{if(h)await h.close();if(server)await new Promise(r=>server.close(r));await db.stop()}
});
