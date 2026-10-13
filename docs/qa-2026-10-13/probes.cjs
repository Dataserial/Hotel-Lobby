const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const root = path.resolve(__dirname, '../..');
const cr = createRequire(root + '/client/package.json');
const sr = createRequire(root + '/server/package.json');
const ts = cr('typescript');
const out = path.join(__dirname, 'evidence.json');
const evidence = [];
const record = (id, data) => { evidence.push({ id, ...data }); console.log(JSON.stringify(evidence.at(-1))); fs.writeFileSync(out, JSON.stringify(evidence, null, 2)); };
const waitTick = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b}); return {promise,resolve,reject}; };
const paged = items => ({items,total:items.length,page:1,limit:100});
function nodes(t, p) { if (!t || typeof t !== 'object') return []; return [...(p(t) ? [t] : []), ...(t.props?.children || []).flatMap(c=>nodes(c,p))]; }
const btn = (t,label) => nodes(t,n=>n.type==='button' && n.props.children.includes(label))[0];
function harness(name, props, api={}) {
  let slots=[], cursor=0, effects=[];
  const react = {
    useState(initial) {const i=cursor++; if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},
    useRef(v) {const i=cursor++;return slots[i]||=( {current:v} )},
    useEffect(fn,deps) {const i=cursor++; const previous=slots[i];if(!previous || !deps || deps.some((d,j)=>d!==previous.deps[j])) {slots[i]={deps};effects.push(fn)}},
    useCallback(fn){return fn},
    createElement(type,props,...children){return {type,props:{...props,children:children.flat(Infinity)}}},
  };
  const component = name === 'PublicHotel' ? 'PublicHotel.tsx' : 'App.tsx';
  const source=fs.readFileSync(root+'/client/src/'+component,'utf8')+'\nexport { '+(name==='PublicHotel'?'PublicHotel':'useList, RoomsView, BookingsView, DashboardView, UsersView, TypesView')+' };';
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,jsxFactory:'React.createElement'}}).outputText;
  const exports={};
  const window={setTimeout:fn=>{queueMicrotask(fn);return 1},clearTimeout(){},addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:true})};
  vm.runInNewContext(code,{exports,React:react,Intl,Date,Map,crypto:require('crypto').webcrypto,window,document:{},requestAnimationFrame:()=>1,cancelAnimationFrame(){},require:n=>n==='react'?react:n==='./api'?{query:v=>new URLSearchParams(Object.entries(v).filter(([,v])=>v!=='' && v!==undefined)).toString(),errorText:e=>e.message,...api}:{}});
  return {render(){cursor=0;return exports[name](props)},renderHook(...args){cursor=0;return exports.useList(...args)},async flush(){const jobs=effects;effects=[];for(const f of jobs)f();await waitTick()},exports};
}
async function componentProbes(){
  const old=deferred(), newer=deferred(), calls=[];
  const call=url=>{calls.push(url);return url.includes('page=1')?old.promise:newer.promise};
  const h=harness('RoomsView',{});let state=h.renderHook(call,'/rooms?page=1',()=>{});await h.flush();state=h.renderHook(call,'/rooms?page=2',()=>{});await h.flush();newer.resolve(paged([{id:'page2'}]));await waitTick();state=h.renderHook(call,'/rooms?page=2',()=>{});const first=state.data.items[0].id;old.resolve(paged([{id:'page1'}]));await waitTick();state=h.renderHook(call,'/rooms?page=2',()=>{});record('list-race',{requests:calls,newerFirst:first,finalItem:state.data.items[0].id,expected:'page2'});

  const occupied={id:'room1',roomNumber:'101',floor:0,roomTypeId:'type1',status:'occupied',active:true};let payload;
  const rc=async url=>url.includes('room-types')?paged([{id:'type1',name:'Standard',active:true,amenities:[]} ]):paged([occupied]);
  const rh=harness('RoomsView',{call:rc,action:async (...a)=>{payload=a;return false},busy:false,setError(){},admin:true,typesPage(){}});
  rh.render();await rh.flush();let t=rh.render();btn(t,'แก้ไข').props.onClick();t=rh.render();const floor=nodes(t,n=>n.type==='input'&&n.props.type==='number')[0].props.value;await nodes(t,n=>n.type==='form'&&n.props.className==='form-grid')[0].props.onSubmit({preventDefault(){}});record('occupied-room-form',{floorDisplayed:floor,originalFloor:0,payload});

  const dh=harness('DashboardView',{call:async url=>url==='/dashboard'?{date:'2026-10-13',availableRooms:1,occupiedRooms:0,arrivalsToday:0,departuresToday:1}:url.includes('checkOut')?paged([{id:'a12345',guestId:'g1',roomId:'r1',checkInDate:'2026-10-12',checkOutDate:'2026-10-13',status:'checked_in'}]):paged([]),user:{name:'Test'},go:()=>{}});
  dh.render();await dh.flush();record('dashboard-button',{buttons:nodes(dh.render(),n=>n.type==='button').map(n=>n.props.children.filter(c=>typeof c==='string').join('')),detailNavigation:'go(bookings) has no booking identifier'});

  const ph=harness('PublicHotel',{staff(){}},{request:async()=>({items:[{roomId:'r1',roomNumber:'101',roomType:'Standard',capacity:2,pricePerNight:1200}],total:24,page:1,limit:12})});
  t=ph.render();await nodes(t,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});await waitTick();t=ph.render();record('public-contact',{links:nodes(t,n=>n.type==='a').map(n=>n.props.href),dialogText:JSON.stringify(nodes(t,n=>n.type==='dialog')[0]),hasPhoneLink:nodes(t,n=>n.type==='a'&&/^tel:/.test(n.props.href)).length});

  const stale=deferred(), fresh=deferred();
  const raceCall=async url=>url.startsWith('/bookings?')?paged([{id:'old001',guestId:'g1',status:'confirmed'},{id:'new002',guestId:'g1',status:'confirmed'}]):url==='/bookings/old001'?stale.promise:url==='/bookings/new002'?fresh.promise:url.endsWith('/payment')?{}:paged([]);
  const detailHarness=harness('BookingsView',{call:raceCall,action(){},busy:false,setError(){},choice:null,clearChoice(){}});
  detailHarness.render();await detailHarness.flush();t=detailHarness.render();const details=nodes(t,n=>n.type==='button'&&n.props.children.includes('รายละเอียด'));details[0].props.onClick();details[1].props.onClick();fresh.resolve({id:'new002',guestId:'g1',status:'confirmed'});await waitTick();const firstModal=nodes(detailHarness.render(),n=>typeof n.props.title==='string'&&n.props.title.startsWith('การจอง #')).map(n=>n.props.title);stale.resolve({id:'old001',guestId:'g1',status:'confirmed'});await waitTick();record('booking-detail-race',{newerModal:firstModal,finalModal:nodes(detailHarness.render(),n=>typeof n.props.title==='string'&&n.props.title.startsWith('การจอง #')).map(n=>n.props.title)});
  const captured=[];const bc=async url=>url==='/bookings/b1'?{id:'b1',guestId:'g1',roomId:'r1',status:'confirmed'}:url.endsWith('/payment')?{ledgerReady:true}:paged([]);
  // Get the actual detail callback by loading a list containing this booking.
  const bc2=async url=>url.startsWith('/bookings?')?paged([{id:'b1',guestId:'g1',status:'confirmed',totalPrice:1000}]):bc(url);
  const mh=harness('BookingsView',{call:bc2,action:async(...args)=>{captured.push(args);return false},busy:false,setError(){},choice:null,clearChoice(){}});
  mh.render();await mh.flush();t=mh.render();await btn(t,'รายละเอียด').props.onClick();await waitTick();t=mh.render();btn(t,'รับเงิน').props.onClick();t=mh.render();nodes(t,n=>n.type==='input'&&n.props.type==='number')[0].props.onChange({target:{value:'100'}});t=mh.render();const reference=nodes(t,n=>n.type==='input'&&n.props.required&&n.props.type!=='number')[0];reference.props.onChange({target:{value:'AUDIT-REF-1'}});t=mh.render();await nodes(t,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});t=mh.render();nodes(t,n=>n.type==='input'&&n.props.type==='number')[0].props.onChange({target:{value:'200'}});t=mh.render();await nodes(t,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});record('payment-edited-retry',{attempts:captured.map(a=>({body:a[2],key:a[3]})),sameKey:captured[0][3]===captured[1][3]});

  const urls=[];const gc=async url=>{urls.push(url);return url.includes('guests')?{items:[],total:101,page:1,limit:100}:paged([])};const gh=harness('BookingsView',{call:gc,action(){},busy:false,setError(){},choice:null,clearChoice(){}});gh.render();await gh.flush();record('guest-pagination',{requests:urls,guestRequests:urls.filter(u=>u.includes('guests'))});

  let fetchOptions;let source=fs.readFileSync(root+'/client/src/api.ts','utf8').replace('import.meta.env.VITE_API_BASE_URL',"''");const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const ex={};vm.runInNewContext(code,{exports:ex,URLSearchParams,Error,fetch:async(u,o)=>{fetchOptions=o;return{status:200,ok:true,json:async()=>{throw new SyntaxError('not JSON')}}}});const result=await ex.request('/test',null);record('api-invalid-json',{result,hasAbortSignal:!!fetchOptions.signal});
  const lum=s=>{const a=s.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2]};const ratio=bg=>(lum(bg)+.05)/(lum('6d8390')+.05);record('text-contrast',{foreground:'#6d8390',white:ratio('ffffff'),canvas:ratio('f5f8fa'),normalTextMinimum:4.5,method:'WCAG relative luminance formula; static CSS, not a browser audit'});
}
async function serverProbes(){
  const {startDatabase}=sr('./tests/task3-db');const db=await startDatabase('hotel_lobby_task5_test');let server;
  try {
    const prisma=db.prisma;const bcrypt=sr('bcryptjs');const {seedDemo}=sr('./scripts/seed-demo');const pass='Audit-Only-Password-123';await seedDemo(prisma,{email:'audit@example.test',password:pass});
    const app=sr('./app').createApp(prisma);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
    const http=async(url,body,token,method='POST',extra={})=>{const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json().catch(()=>null),requestId:r.headers.get('x-request-id')}};
    const login=await http('/api/auth/login',{email:'audit@example.test',password:pass});const token=login.data.token;const admin=login.data.user;
    const room=await prisma.room.findFirst({where:{number:'DEMO-101'}});const guest=await prisma.guest.create({data:{fullName:'Audit Fixture',phone:'0812345678',documentNo:'AUDIT-FIXTURE',documentNoKey:'AUDIT-FIXTURE',active:true}});
    const {hotelToday}=sr('./services/stay-service');const today=hotelToday(new Date());const day=n=>new Date(Date.parse(today+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
    const booking=await http('/api/bookings',{guestId:guest.id,roomId:room.id,guestCount:2,checkInDate:today,checkOutDate:day(1)},token);const checkin=await http('/api/bookings/'+booking.data.id+'/check-in',{},token);const availability=await http('/api/public/rooms/availability?checkInDate='+day(3)+'&checkOutDate='+day(4)+'&guestCount=2',null,null,'GET');const future=await http('/api/bookings',{guestId:guest.id,roomId:room.id,guestCount:2,checkInDate:day(3),checkOutDate:day(4)},token);record('occupied-future-availability',{checkinStatus:checkin.status,searchStatus:availability.status,roomReturned:availability.data.items.some(r=>r.roomId===room.id),futureBookingStatus:future.status,error:future.data.error,requestedDates:[day(3),day(4)],existingDeparture:day(1)});
    const edit=await http('/api/rooms/'+room.id,{roomNumber:room.number,floor:room.floor,roomTypeId:room.roomTypeId},token,'PATCH');record('occupied-edit-http',{status:edit.status,error:edit.data.error});
    const spaced=' Audit-Spaces-123 ';const created=await http('/api/users',{name:'Spaced fixture',email:'spaced@example.test',password:spaced,role:'receptionist'},token);const spaceLogin=await http('/api/auth/login',{email:'spaced@example.test',password:spaced});record('password-whitespace',{createStatus:created.status,loginStatus:spaceLogin.status,error:spaceLogin.data.error});
    const prefix='x'.repeat(72);const long=await http('/api/users',{name:'Long fixture',email:'long@example.test',password:prefix+'A',role:'receptionist'},token);const changed=await http('/api/auth/login',{email:'long@example.test',password:prefix+'B'});record('password-truncation',{createStatus:long.status,differentSuffixLoginStatus:changed.status,bytes:Buffer.byteLength(prefix+'A'),bcryptTruncates:bcrypt.truncates(prefix+'A')});
    const changedPassword=await http('/api/users/'+admin.id,{password:'Changed-Audit-Password-321'},token,'PATCH');const me=await http('/api/auth/me',null,token,'GET');record('password-session-revocation',{passwordChangeStatus:changedPassword.status,oldTokenMeStatus:me.status,sessions:await prisma.session.count({where:{userId:admin.id}})});
    const fixtureRoom=await prisma.room.findFirst({where:{number:'DEMO-102'}});const b2=await http('/api/bookings',{guestId:guest.id,roomId:fixtureRoom.id,guestCount:2,checkInDate:day(3),checkOutDate:day(4)},token);const occurredAt=new Date().toISOString();const hdr={'Idempotency-Key':'audit-payment-fixed-key'};const received=await http('/api/bookings/'+b2.data.id+'/payment/receipts',{amount:100,method:'cash',reference:'AUDIT-MONEY-1',occurredAt},token,'POST',hdr);const edited=await http('/api/bookings/'+b2.data.id+'/payment/receipts',{amount:200,method:'cash',reference:'AUDIT-MONEY-1',occurredAt},token,'POST',hdr);record('payment-server-conflict',{first:received.status,editedRetry:edited.status,error:edited.data.error});
    const editRoom=await prisma.room.findFirst({where:{number:'DEMO-103'}});const b3=await http('/api/bookings',{guestId:guest.id,roomId:editRoom.id,guestCount:2,checkInDate:day(3),checkOutDate:day(4)},token);
    const ownAvailability=await http('/api/rooms/availability?checkInDate='+day(3)+'&checkOutDate='+day(5)+'&guestCount=2',null,token,'GET');const ownEdit=await http('/api/bookings/'+b3.data.id,{checkOutDate:day(5)},token,'PATCH');record('own-booking-search',{roomReturned:ownAvailability.data.items.some(r=>r.roomId===editRoom.id),apiEditStatus:ownEdit.status,existingDates:[day(3),day(4)],editedDates:[day(3),day(5)]});
    const headerApp=sr('./app').createApp(prisma);const request=sr('supertest');const headers=await request(headerApp).get('/health').set('X-Forwarded-Proto','https').set('X-Forwarded-For','198.51.100.10');record('proxy-config',{trustProxy:headerApp.get('trust proxy'),forwardedHttpsHsts:headers.headers['strict-transport-security']||null});let last;
    for(let i=0;i<21;i++)last=await request(headerApp).post('/api/auth/login').set('X-Forwarded-For','198.51.100.'+(10+i)).send({email:'nobody@example.test',password:'bad-audit-only'});record('proxy-shared-rate-limit',{lastStatus:last.status,error:last.body.error,distinctForwardedIps:21});
    const {demoConfig}=sr('./scripts/seed-demo');let seedError;try{demoConfig({DATABASE_URL:'mongodb+srv://fake:fake@example.invalid/hotel_lobby_staging',DEMO_ADMIN_EMAIL:'a@example.test',DEMO_ADMIN_PASSWORD:pass})}catch(e){seedError=e.message}record('atlas-demo-doc',{seedError});
  } finally {if(server)await new Promise(r=>server.close(r));await db.stop()}
}
(async()=>{await componentProbes();await serverProbes();console.log('Audit probes complete')})().catch(e=>{console.error(e);process.exitCode=1});
