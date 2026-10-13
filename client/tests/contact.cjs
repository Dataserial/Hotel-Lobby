const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./helpers/components.cjs');
test('public contact explicitly reports unavailable channels when no real channel is configured',()=>{
  const h=harness({staff(){}}, {}, 'PublicHotel.tsx');
  assert.ok(JSON.stringify(h.render('default')).includes('ยังไม่ได้ตั้งค่าช่องทางติดต่อ'));
});
