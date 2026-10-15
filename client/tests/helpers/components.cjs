// ทดสอบจำลองสถานะ React เพื่อเรียกตัวจัดการเหตุการณ์จริงในการทดสอบ
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness(props = {}, api = {}, filename = 'App.tsx') {
  let slots = [], cursor = 0, pending = [];
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
  const react = {
    useState(initial) { const i=cursor++; if (!(i in slots)) slots[i]=typeof initial==='function'?initial():initial; return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]; },
    useRef(value) { const i=cursor++; return slots[i] ||= { current:value }; },
    useCallback(fn,deps) { const i=cursor++; if (!slots[i] || !same(slots[i].deps,deps)) slots[i]={fn,deps};return slots[i].fn; },
    useEffect(fn,deps) { const i=cursor++; if (!slots[i] || !same(slots[i].deps,deps)) {const previous=slots[i];slots[i]={deps};pending.push(()=>{previous?.cleanup?.();slots[i].cleanup=fn()});} },
    createElement(type,props,...children) { return {type,props:{...props,children:children.flat(Infinity)}}; },
  };
  const extra=filename==='App.tsx'?'\nexport { useList, BookingsView, RoomsView, DashboardView, UsersView, TypesView };':'';
  const source=(fs.readFileSync(path.resolve(__dirname,'../../src',filename),'utf8')+extra).replaceAll('import.meta.env','({})');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,jsxFactory:'React.createElement'}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,React:react,Intl,Date,Map,Set,AbortController,DOMException,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,
    window:{setTimeout,clearTimeout,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:true})},document:{},
    requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    require:name=>name==='react'?react:name==='./contact'?{contactChannels:()=>[]}:name==='./api'?{query:values=>new URLSearchParams(Object.entries(values).filter(([,v])=>v!==undefined&&v!=='')).toString(),paymentOccurredAt:async()=>new Date().toISOString(),errorText:e=>e.message,...api}:{}
  });
  return {exports,render(name){cursor=0;return (name==='default'?exports.default:exports[name])(props)},hook(name,...args){cursor=0;return exports[name](...args)},
    async flush(){const jobs=pending;pending=[];jobs.forEach(fn=>fn());await new Promise(r=>setTimeout(r,0));await tick()},
    unmount(){slots.forEach(s=>s?.cleanup?.());pending=[];},};
}
function nodes(tree,predicate) { if(!tree||typeof tree!=='object')return [];return [...(predicate(tree)?[tree]:[]),...(tree.props?.children||[]).flatMap(child=>nodes(child,predicate))]; }
const button=(tree,label)=>nodes(tree,n=>n.type==='button'&&n.props.children.includes(label))[0];
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
// ตรวจเลขหน้าและจำนวนรายการต่อหน้า
const page=(items,total=items.length,n=1,limit=20)=>({items,total,page:n,limit});
module.exports={harness,nodes,button,tick,deferred,page};
