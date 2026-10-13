const {test}=require('node:test');const assert=require('node:assert/strict');
const {domApp}=require('./helpers/dom.cjs');

test('category selector has no alternative-date controls and filters paginated results',{timeout:180000},async()=>{
  const {startDatabase}=require('../../server/tests/task3-db');const {createApp}=require('../../server/app');
  const db=await startDatabase('hotel_lobby_task5_test');let server,h;
  try{
    for(const [name,capacity,price,count] of [['Standard',2,1200,2],['Deluxe',2,1800,13],['Family',4,2600,1]]){const type=await db.prisma.roomType.create({data:{name,nameKey:name.toLowerCase(),capacity,basePrice:price,amenities:[]}});for(let i=0;i<count;i++)await db.prisma.room.create({data:{number:name+'-'+i,roomTypeId:type.id,active:true,status:'available'}})}
    server=createApp(db.prisma).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));h=domApp('http://localhost:5173/#discover',{VITE_API_BASE_URL:'http://127.0.0.1:'+server.address().port+'/api'});
    const PublicHotel=h.loadSource('PublicHotel.tsx').default;await h.React.act(async()=>h.root.render(h.React.createElement(PublicHotel,{staff(){}})));const doc=h.dom.window.document;await h.waitFor(()=>doc.querySelector('.room-type-card'));
    assert.equal(doc.querySelectorAll('.room-type-selector button').length,3);assert.ok(doc.querySelector('.room-type-selector h3'));assert.equal(doc.querySelectorAll('.date-chip').length,0);
    const deluxe=Array.from(doc.querySelectorAll('.room-type-selector button')).find(button=>button.textContent==='Deluxe');await h.React.act(async()=>deluxe.click());assert.equal(doc.querySelector('.room-type-card h3').textContent,'Deluxe');assert.ok(doc.querySelector('.room-type-card').textContent.includes('1,800'));
    await h.React.act(async()=>h.button('ดูห้องว่างช่วงที่เลือก').click());await h.waitFor(()=>doc.querySelector('.public-room-card')&&doc.querySelector('.public-results').getAttribute('aria-busy')==='false');assert.equal(doc.querySelectorAll('.public-room-card').length,12);assert.ok(Array.from(doc.querySelectorAll('.public-room-card h3')).every(node=>node.textContent==='Deluxe'));
    await h.React.act(async()=>h.button('ถัดไป').click());await h.waitFor(()=>doc.querySelectorAll('.public-room-card').length===1);assert.equal(doc.querySelector('.public-room-card h3').textContent,'Deluxe');
  }finally{if(h)await h.close();if(server)await new Promise(r=>server.close(r));await db.stop()}
});
