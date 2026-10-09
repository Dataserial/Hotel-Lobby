const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')

// Execute the actual component handlers with deterministic hook state and deferred APIs.
function harness(component, props) {
  let slots = [], cursor = 0
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value } },
    useEffect() {}, useCallback(fn) { return fn },
    createElement(type, props, ...children) { return { type, props: { ...props, children: children.flat(Infinity) } } },
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8')
    + '\nexport { StaffAvailability, BookingsView, allBookings };'
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'React.createElement' } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, React: react, Intl, Date, Map, window: {}, require: name => name === 'react' ? react : name === './api' ? { query: values => new URLSearchParams(values).toString(), errorText: e => e.message } : {} })
  return { exports, render() { cursor = 0; return exports[component](props) } }
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return []
  return [...(predicate(tree) ? [tree] : []), ...(tree.props?.children || []).flatMap(child => nodes(child, predicate))]
}
const button = (tree, label) => nodes(tree, n => n.type === 'button' && n.props.children.includes(label))[0]
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const page = items => ({ items, total: items.length, page: 1, limit: 100 })

test('departure loading includes all pages and does not restrict booking status', async () => {
  const h = harness('StaffAvailability', {})
  const urls = []
  const rows = await h.exports.allBookings(async url => { urls.push(url); return { items: [{ id: urls.length, status: urls.length === 1 ? 'checked_in' : 'checked_out' }], total: 2, page: urls.length, limit: 1 } }, { checkOutFrom: '2026-10-09', checkOutTo: '2026-10-09' })
  assert.equal(rows.length, 2)
  assert.equal(rows[1].status, 'checked_out')
  assert.ok(urls.every(url => url.includes('checkOutFrom=2026-10-09') && !url.includes('status=')))
})

test('staff search ignores stale success and stale errors after criteria change', async () => {
  for (const reject of [false, true]) {
    const request = deferred()
    const h = harness('StaffAvailability', { call: () => request.promise })
    let tree = h.render()
    nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
    tree = h.render()
    nodes(tree, n => n.type === 'input' && n.props.type === 'date')[0].props.onChange({ target: { value: '2026-12-20' } })
    if (reject) request.reject(new Error('stale failure')); else request.resolve(page([{ roomId: 'old' }]))
    await new Promise(resolve => setImmediate(resolve))
    tree = h.render()
    assert.equal(nodes(tree, n => n.props.className === 'staff-room-card').length, 0)
    assert.equal(button(tree, 'ค้นหา').props.disabled, false)
    assert.ok(!JSON.stringify(tree).includes('stale failure'))
  }
})

test('editing the same stay preserves the booked price on review', async () => {
  const booking = { id: 'booking1', guestId: 'guest1', roomId: 'room1', guestCount: 2, checkInDate: '2026-10-09', checkOutDate: '2026-10-11', totalPrice: 3600, pricePerNight: 1800, status: 'confirmed' }
  let tree
  const h2 = harness('BookingsView', { call: async path => path.startsWith('/bookings?') ? page([booking]) : path.endsWith('/payment') ? {} : path.includes('transactions') ? page([]) : booking, choice: null, clearChoice() {}, setError() {} })
  tree = h2.render(); await button(tree, '↻ รีเฟรช').props.onClick()
  tree = h2.render(); button(tree, 'รายละเอียด').props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  tree = h2.render(); button(tree, 'แก้ไข').props.onClick()
  tree = h2.render(); await nodes(tree, n => n.type === 'form' && n.props.className === 'form-grid booking-form')[0].props.onSubmit({ preventDefault() {} })
  assert.ok(JSON.stringify(h2.render()).includes('3,600'))
})

test('booking form cannot select a response for dates that were changed in flight', async () => {
  const request = deferred()
  const h = harness('BookingsView', { call: () => request.promise, choice: null, clearChoice() {}, setError() {} })
  let tree = h.render(); button(tree, '＋ สร้างการจอง').props.onClick()
  tree = h.render(); const pending = button(tree, 'ค้นหาห้องว่าง').props.onClick()
  tree = h.render(); nodes(tree, n => n.type === 'input' && n.props.type === 'date')[0].props.onChange({ target: { value: '2026-12-20' } })
  request.resolve(page([{ roomId: 'old', roomNumber: '101', pricePerNight: 1000 }]))
  await pending
  tree = h.render()
  assert.ok(!JSON.stringify(tree).includes('101'))
  assert.equal(button(tree, 'ค้นหาห้องว่าง').props.disabled, false)
})

test('an older response cannot overwrite a newer search or clear its loading state', async () => {
  const old = deferred(), current = deferred()
  let count = 0
  const h = harness('StaffAvailability', { call: () => ++count === 1 ? old.promise : current.promise })
  let tree = h.render()
  nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  tree = h.render()
  nodes(tree, n => n.type === 'input' && n.props.type === 'number')[0].props.onChange({ target: { value: '3' } })
  tree = h.render()
  nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  old.resolve(page([{ roomId: 'old' }]))
  await new Promise(resolve => setImmediate(resolve))
  tree = h.render()
  assert.equal(button(tree, 'กำลังค้นหา…').props.disabled, true)
  current.resolve(page([{ roomId: 'new', roomNumber: '303', roomType: 'Triple', capacity: 3, pricePerNight: 1500 }]))
  await new Promise(resolve => setImmediate(resolve))
  tree = h.render()
  assert.equal(nodes(tree, n => n.props.className === 'staff-room-card').length, 1)
  assert.ok(JSON.stringify(tree).includes('303'))
})
