const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function api(fetch) {
  const source=fs.readFileSync(require('node:path').resolve(__dirname,'../src/api.ts'),'utf8').replaceAll('import.meta.env','({})');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,fetch,AbortController,DOMException,URLSearchParams,setTimeout,clearTimeout});return exports;
}
test('incorrect credentials show only the friendly Thai message without a request ID',()=>{
  assert.equal(api(()=>{}).errorText({code:'INVALID_CREDENTIALS',message:'Invalid credentials',requestId:'trace-fixture'}),'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
});
test('API rejects successful HTML, null JSON and malformed page items',async()=>{
  for(const response of [new Response('<html>oops</html>',{headers:{'Content-Type':'text/html'}}),Response.json(null),Response.json({items:[{id:5}],total:1,page:1,limit:20})]) {
    await assert.rejects(api(async()=>response).request('/guests',null),e=>e.code==='PROTOCOL_ERROR');
  }
});

test('API preserves valid create/list JSON, no-content semantics and server error IDs',async()=>{
  const guest={id:'g1',fullName:'Guest',phone:'0812345678'};
  assert.equal((await api(async()=>Response.json(guest)).request('/guests',null,{method:'POST',body:{}})).id,'g1');
  assert.equal((await api(async()=>Response.json({items:[guest],total:1,page:1,limit:20})).request('/guests?limit=20',null)).items[0].id,'g1');
  assert.equal(await api(async()=>new Response(null,{status:204})).request('/auth/logout',null,{method:'POST'}),null);
  await assert.rejects(api(async()=>new Response(null,{status:204})).request('/guests',null),e=>e.code==='PROTOCOL_ERROR');
  await assert.rejects(api(async()=>Response.json({error:{code:'FORBIDDEN',message:'Denied',requestId:'req-fixture'}},{status:403})).request('/users',null),e=>e.status===403&&e.requestId==='req-fixture');
});

test('API rejects paginated envelopes on login, profile and payment detail endpoints',async()=>{
  const page={items:[],page:1,limit:20,total:0};
  for(const [path,method] of [['/auth/login','POST'],['/auth/profile','PATCH'],['/bookings/b1/payment','GET'],['/guests','POST']]) {
    await assert.rejects(api(async()=>Response.json(page)).request(path,null,{method}),e=>e.code==='PROTOCOL_ERROR',path+' '+method);
  }
});

for(const path of ['/rooms/availability','/public/rooms/availability']) test('API accepts paginated availability responses from '+path,async()=>{
  const room={roomId:'r1',roomNumber:'101',roomType:'Standard',capacity:2,pricePerNight:1200};
  const page={items:[room],page:1,limit:12,total:1};
  const result=await api(async()=>Response.json(page)).request(path+'?checkInDate=2026-10-13&checkOutDate=2026-10-14&guestCount=2',null);
  assert.equal(result.items[0].roomId,'r1');assert.equal(result.total,1);
  await assert.rejects(api(async()=>Response.json({...page,items:[{...room,capacity:'invalid'}]})).request(path,null),e=>e.code==='PROTOCOL_ERROR');
});

test('API rejects malformed rendered guest and room fields while preserving legacy nulls',async()=>{
  const guest={id:'g1',fullName:'Guest',phone:'0812345678'};
  const room={id:'r1',roomNumber:'101'};
  for(const [path,item,field] of [['/guests/g1',guest,'email'],['/guests/g1',guest,'documentNoMasked'],['/rooms/r1',room,'roomTypeId'],['/rooms/r1',room,'status'],['/rooms/r1',room,'floor'],['/rooms/r1',room,'active']]) {
    await assert.rejects(api(async()=>Response.json({...item,[field]:{invalid:true}})).request(path,null),e=>e.code==='PROTOCOL_ERROR',field);
  }
  assert.equal((await api(async()=>Response.json({...guest,email:null,documentNoMasked:null})).request('/guests/g1',null)).id,'g1');
  assert.equal((await api(async()=>Response.json({...room,roomTypeId:null,status:null,floor:null,active:null})).request('/rooms/r1',null)).id,'r1');
  assert.equal((await api(async()=>Response.json({...room,roomTypeId:'t1',status:'available',floor:1,active:true})).request('/rooms/r1',null)).floor,1);
});

for(const field of ['date','checkOutDate']) test('API validates real YYYY-MM-DD public overview '+field,async()=>{
  const overview={date:'2026-10-13',checkOutDate:'2026-10-14',timezone:'Asia/Bangkok',updatedAt:'2026-10-13T03:00:00Z',totalRooms:0,availableRooms:0,bookedRooms:0,roomTypes:[]};
  for(const value of ['not-a-date','2026-02-30','2026-02-29','2026-13-01','2026-00-01','2026-10-00','2026-4-01','2026-10-13T00:00:00Z']) {
    await assert.rejects(api(async()=>Response.json({...overview,[field]:value})).request('/public/overview',null),error=>error.code==='PROTOCOL_ERROR',field+' '+value);
  }
  assert.equal((await api(async()=>Response.json({...overview,[field]:'2028-02-29'})).request('/public/overview',null))[field],'2028-02-29');
});

test('API deadline and caller cancellation settle hung fetch and attach a signal',async()=>{
  const fetch=(_url,{signal})=>new Promise((_,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});if(signal.aborted)reject(new DOMException('aborted','AbortError'))});
  await assert.rejects(api(fetch).request('/guests',null,{timeoutMs:10}),e=>e.code==='TIMEOUT');
  const controller=new AbortController();const pending=api(fetch).request('/guests',null,{signal:controller.signal});controller.abort();
  await assert.rejects(pending,e=>e.code==='CANCELLED');
});
