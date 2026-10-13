const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const {JSDOM}=require('jsdom');
function setup(){const file=path.resolve(__dirname,'../src/reveal.ts');if(!fs.existsSync(file))return{};const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});return exports}
test('scroll reveal shows an intersecting section once and releases observers on cleanup',()=>{
  const dom=new JSDOM('<main><section data-reveal>Rooms</section></main>');const root=dom.window.document.querySelector('main'),section=root.firstElementChild;
  section.getBoundingClientRect=()=>({top:1000,bottom:1100});let callback,observed=0,unobserved=0,disconnected=0;
  dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  dom.window.IntersectionObserver=class{constructor(fn){callback=fn}observe(){observed++}unobserve(){unobserved++}disconnect(){disconnected++}};
  const motion=setup();assert.equal(typeof motion.setupReveal,'function');const cleanup=motion.setupReveal(root);
  assert.equal(observed,1);assert.ok(section.classList.contains('reveal-pending'));assert.ok(!section.classList.contains('is-revealed'));
  callback([{target:section,isIntersecting:true}]);assert.ok(section.classList.contains('is-revealed'));assert.equal(unobserved,1);
  cleanup();assert.ok(disconnected>=1);assert.ok(!section.classList.contains('reveal-pending'));dom.window.close();
});
test('reduced motion and unsupported observation never hide page content',()=>{
  const dom=new JSDOM('<main><section data-reveal>Always visible</section></main>');const root=dom.window.document.querySelector('main');
  dom.window.matchMedia=()=>({matches:true});const motion=setup();assert.equal(typeof motion.setupReveal,'function');motion.setupReveal(root)();assert.ok(!root.firstElementChild.classList.contains('reveal-pending'));
  dom.window.matchMedia=()=>({matches:false});motion.setupReveal(root)();assert.ok(!root.firstElementChild.classList.contains('reveal-pending'));dom.window.close();
});
test('dynamic results are revealed for keyboard focus and a changed motion preference',async()=>{
  const dom=new JSDOM('<main></main>');const root=dom.window.document.querySelector('main');let change;
  const preference={matches:false,addEventListener(type,fn){change=fn},removeEventListener(){}};
  dom.window.matchMedia=()=>preference;const observed=[];
  dom.window.IntersectionObserver=class{observe(element){observed.push(element)}unobserve(){}disconnect(){}};
  const cleanup=setup().setupReveal(root);
  root.innerHTML='<article data-reveal><button>Contact</button></article><article data-reveal>Second room</article>';
  await new Promise(resolve=>dom.window.setTimeout(resolve,0));
  assert.equal(observed.length,2);root.querySelector('button').focus();
  assert.ok(root.firstElementChild.classList.contains('is-revealed'));
  preference.matches=true;change();assert.ok(root.lastElementChild.classList.contains('is-revealed'));
  cleanup();root.innerHTML='<section data-reveal>After cleanup</section>';
  await new Promise(resolve=>dom.window.setTimeout(resolve,0));assert.equal(observed.length,2);dom.window.close();
});
