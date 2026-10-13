const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const luminance=s=>{const a=s.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2]};
test('secondary text tokens meet normal text contrast on white and canvas',()=>{
  const css=fs.readFileSync(path.resolve(__dirname,'../src/index.css'),'utf8');
  const color=/--muted:\s*#([a-f0-9]{6})/i.exec(css)[1];
  for(const bg of ['ffffff','f5f8fa']) assert.ok((luminance(bg)+.05)/(luminance(color)+.05)>=4.5,`muted text fails on ${bg}`);
});
