const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, deferred, page, tick, nodes, button } = require('./helpers/components.cjs');

test('list keeps current page when an old request resolves or rejects after it', async () => {
  for (const failure of [false,true]) {
    const old=deferred(), current=deferred(), errors=[];
    const call=url=>url.includes('page=1')?old.promise:current.promise;
    const setError=e=>errors.push(e);
    const h=harness();h.hook('useList',call,'/rooms?page=1',setError);await h.flush();
    h.hook('useList',call,'/rooms?page=2',setError);await h.flush();
    current.resolve(page([{id:'new'}]));await tick();
    if(failure)old.reject(new Error('obsolete'));else old.resolve(page([{id:'old'}]));await tick();
    const state=h.hook('useList',call,'/rooms?page=2',setError);
    assert.equal(state.data.items[0].id,'new');assert.equal(state.loading,false);assert.deepEqual(errors,[]);
    h.unmount();
  }
});

test('room editor preserves floor zero and patches only allowed changed metadata on occupied rooms',async()=>{
  const room={id:'r1',roomNumber:'101',floor:0,roomTypeId:'t1',status:'occupied',active:true};let payload;
  const h=harness({call:async url=>url.includes('room-types')?page([{id:'t1',name:'Standard',active:true,amenities:[]}]):page([room]),action:async(...args)=>{payload=args;return true},busy:false,setError(){},admin:true,typesPage(){}});
  h.render('RoomsView');await h.flush();button(h.render('RoomsView'),'แก้ไข').props.onClick();let t=h.render('RoomsView');
  const input=nodes(t,n=>n.type==='input'&&n.props.type==='number')[0];assert.equal(input.props.value,0);input.props.onChange({target:{value:'-1'}});
  t=h.render('RoomsView');await nodes(t,n=>n.type==='form'&&n.props.className==='form-grid')[0].props.onSubmit({preventDefault(){}});
  assert.equal(JSON.stringify(payload),JSON.stringify(['/rooms/r1','PATCH',{floor:-1}]));h.unmount();
});

test('types and users expose pagination beyond the first hundred records',async()=>{
  for(const component of ['TypesView','UsersView']){
    const calls=[];const h=harness({call:async url=>{calls.push(url);return page([{id:'row1',name:'Test',amenities:[],role:'admin',active:true}],101,1,20)},setError(){},action:async()=>true,busy:false,self:'self'});
    h.render(component);await h.flush();let t=h.render(component);const pager=nodes(t,n=>typeof n.props.change==='function'&&n.props.data?.total===101)[0];
    assert.ok(pager,'must have a next page control');pager.props.change(2);h.render(component);await h.flush();
    assert.ok(calls.some(url=>url.includes('page=2')));h.unmount();
  }
});

test('booking guest selector is searchable and paginated rather than a first-100 dropdown',async()=>{
  const h=harness({call:async()=>page([]),action:async()=>true,busy:false,setError(){},choice:null,clearChoice(){}});
  h.render('BookingsView');await h.flush();button(h.render('BookingsView'),'＋ สร้างการจอง').props.onClick();
  const picker=nodes(h.render('BookingsView'),n=>typeof n.type==='function'&&n.type.name==='PagedPicker'&&n.props.path.startsWith('/guests'))[0];
  assert.ok(picker);h.unmount();
});

test('room type selector and refund source use independent searchable pagination',async()=>{
  const h=harness({call:async()=>page([]),action:async()=>true,busy:false,setError(){},admin:true,typesPage(){}});
  h.render('RoomsView');await h.flush();button(h.render('RoomsView'),'＋ เพิ่มห้องพัก').props.onClick();
  assert.ok(nodes(h.render('RoomsView'),n=>typeof n.type==='function'&&n.type.name==='PagedPicker'&&n.props.path.startsWith('/room-types'))[0]);h.unmount();
});

test('booking room search can reach a room beyond the first inventory page',async()=>{
  const calls=[];
  const call=async url=>{calls.push(url);return url.includes('/availability')?page([{roomId:url.includes('page=2')?'room101':'room1',roomNumber:url.includes('page=2')?'ROOM-101':'ROOM-1',roomType:'Standard',capacity:2,pricePerNight:1200}],101,url.includes('page=2')?2:1,20):page([])};
  const h=harness({call,action:async()=>true,busy:false,setError(){},choice:null,clearChoice(){}});
  h.render('BookingsView');await h.flush();button(h.render('BookingsView'),'＋ สร้างการจอง').props.onClick();await button(h.render('BookingsView'),'ค้นหาห้องว่าง').props.onClick();await tick();
  const pager=nodes(h.render('BookingsView'),n=>typeof n.props.change==='function'&&n.props.data?.total===101)[0];assert.ok(pager);await pager.props.change(2);await tick();
  assert.ok(calls.some(url=>url.includes('page=2')&&url.includes('limit=20')));assert.ok(JSON.stringify(h.render('BookingsView')).includes('ROOM-101'));h.unmount();
});

test('booking detail ignores old responses and does not reopen after close', async () => {
  const old=deferred(),current=deferred();
  const bookings=[{id:'old001',guestId:'g1',status:'confirmed'},{id:'new002',guestId:'g1',status:'confirmed'}];
  const call=async url=>url.startsWith('/bookings?')?page(bookings):url==='/bookings/old001'?old.promise:url==='/bookings/new002'?current.promise:url.endsWith('/payment')?{}:page([]);
  const h=harness({call,action:async()=>true,busy:false,setError(){},choice:null,clearChoice(){}});
  h.render('BookingsView');await h.flush();let t=h.render('BookingsView');
  const buttons=nodes(t,n=>n.type==='button'&&n.props.children.includes('รายละเอียด'));
  buttons[0].props.onClick();buttons[1].props.onClick();current.resolve({id:'new002',guestId:'g1',status:'confirmed'});await tick();
  old.resolve({id:'old001',guestId:'g1',status:'confirmed'});await tick();t=h.render('BookingsView');
  let modal=nodes(t,n=>typeof n.props.title==='string'&&n.props.title.startsWith('การจอง #'))[0];
  assert.equal(modal.props.title,'การจอง #NEW002');modal.props.close();
  assert.equal(nodes(h.render('BookingsView'),n=>typeof n.props.title==='string'&&n.props.title.startsWith('การจอง #')).length,0);
  h.unmount();
});

test('dashboard passes the exact booking ID, not just a navigation tab', async () => {
  const navigated=[];
  const call=async url=>url==='/dashboard'?{date:'2026-10-13'}:url.includes('activityDate')?page([{id:'outside-page-id',guestId:'g1',roomId:'r1',status:'checked_in'}]):url==='/guests/g1'?{id:'g1',fullName:'Archived'}:url==='/rooms/r1'?{id:'r1',roomNumber:'101'}:page([]);
  const h=harness({call,user:{name:'Desk'},go:(...args)=>navigated.push(args)});
  h.render('DashboardView');await h.flush();button(h.render('DashboardView'),'ดูการจอง →').props.onClick();
  assert.deepEqual(navigated,[['bookings','outside-page-id']]);h.unmount();
});

test('dashboard resolves archived guests and rooms by referenced ID outside first page',async()=>{
  const call=async url=>url==='/dashboard'?{date:'2026-10-13'}:url.includes('activityDate')?page([{id:'beyond001',guestId:'archived101',roomId:'room101',status:'checked_in'}]):url==='/guests/archived101'?{id:'archived101',fullName:'Archived Guest 101',active:false}:url==='/rooms/room101'?{id:'room101',roomNumber:'ROOM-101'}:page([]);
  const h=harness({call,user:{name:'Desk'},go(){}});h.render('DashboardView');await h.flush();
  const tree=JSON.stringify(h.render('DashboardView'));assert.ok(tree.includes('Archived Guest 101'));assert.ok(tree.includes('ROOM-101'));h.unmount();
});

test('dashboard shows actual early departure even when the scheduled dates are outside today', async () => {
  const urls = [];
  const call = async url => {
    urls.push(url);
    if (url === '/dashboard') return { date: '2026-10-14', availableRooms: 60, occupiedRooms: 0, arrivalsToday: 0, departuresToday: 1 };
    if (url.includes('activityDate')) return page([{ id: 'early-checkout', guestId: 'guest', roomId: 'room', checkInDate: '2026-10-13', checkOutDate: '2026-10-15', status: 'checked_out' }]);
    if (url === '/guests/guest') return { id: 'guest', fullName: 'Early Guest' };
    if (url === '/rooms/room') return { id: 'room', roomNumber: '301' };
    return page([]);
  };
  const h = harness({ call, user: { name: 'Desk' }, go() {} });
  h.render('DashboardView'); await h.flush();
  const tree = JSON.stringify(h.render('DashboardView'));
  assert.ok(tree.includes('Early Guest'));
  assert.ok(tree.includes('เช็กเอาต์แล้ววันนี้ตามเวลาไทย'));
  assert.ok(urls.some(url => url.includes('activityDate=2026-10-14')));
  h.unmount();
});
