const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ts=require('typescript');const {JSDOM}=require('jsdom');

function domApp(url='http://localhost:5173/',env={}) {
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url,pretendToBeVisual:true});
  const saved=new Map();
  const globals={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLDialogElement:dom.window.HTMLDialogElement,navigator:dom.window.navigator,sessionStorage:dom.window.sessionStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true};
  for(const [key,value]of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
  dom.window.scrollTo=()=>{};dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
  const cache=new Map();
  function load(filename) {
    if(cache.has(filename))return cache.get(filename).exports;
    const module={exports:{}};cache.set(filename,module);
    const source=fs.readFileSync(filename,'utf8').replaceAll('import.meta.env','('+JSON.stringify(env)+')');
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const localRequire=name=>{if(!name.startsWith('.'))return require(name);if(name.endsWith('.css'))return{};const base=path.resolve(path.dirname(filename),name);const file=['','.tsx','.ts'].map(s=>base+s).find(f=>fs.existsSync(f));if(!file)throw new Error('Missing test module '+name);return load(file)};
    vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename})(localRequire,module,module.exports);
    return module.exports;
  }
  const React=require('react');const {createRoot}=require('react-dom/client');const root=createRoot(dom.window.document.getElementById('root'));
  const loadSource=name=>load(path.resolve(__dirname,'../../src',name));
  const button=text=>Array.from(dom.window.document.querySelectorAll('button')).find(b=>b.textContent.trim()===text);
  async function input(element,value){await React.act(async()=>{const descriptor=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value');descriptor.set.call(element,value);element.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})}
  async function openAccount(){const trigger=dom.window.document.querySelector('[data-account-trigger]');if(!trigger)throw new Error('Account menu trigger missing');if(trigger.getAttribute('aria-expanded')!=='true')await React.act(async()=>trigger.click())}
  async function waitFor(predicate,timeout=10000){const end=Date.now()+timeout;while(!predicate()){if(Date.now()>end)throw new Error('DOM condition timed out: '+dom.window.document.body.textContent.slice(0,600));await React.act(async()=>{await new Promise(r=>setTimeout(r,20))})}}
  return {dom,React,root,loadSource,button,input,openAccount,waitFor,async close(){await React.act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}};
}
module.exports={domApp};
