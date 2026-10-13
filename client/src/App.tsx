import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { request, query, errorText, type ApiError, type User, type Paged, type Guest, type RoomType, type Room, type AvailableRoom, type Booking, type Payment, type Transaction, type Dashboard, type Report } from './api'
import './App.css'
import PublicHotel from './PublicHotel'
import { Brand } from './Brand'
import MemberAccount from './MemberAccount'

type Tab = 'dashboard' | 'availability' | 'bookings' | 'guests' | 'rooms' | 'types' | 'users' | 'report'
type Call = <T,>(path: string, options?: { method?: string; body?: unknown; idempotencyKey?: string; signal?: AbortSignal }) => Promise<T>
type Action = (path: string, method: string, body?: unknown, key?: string) => Promise<boolean>
type RoomChoice = { room: AvailableRoom; checkInDate: string; checkOutDate: string; guestCount: number }
type Shared = { call: Call; action: Action; busy: boolean; setError: (value: string) => void }
const money = (v: number) => new Intl.NumberFormat('th-TH').format(v || 0)
const hotelToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const nextDay = (s: string) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }
const names: Record<string, string> = { confirmed: 'ยืนยันแล้ว', checked_in: 'เข้าพัก', checked_out: 'ออกแล้ว', cancelled: 'ยกเลิก', available: 'พร้อมใช้งาน', occupied: 'มีผู้เข้าพัก', maintenance: 'ซ่อมบำรุง', cash: 'เงินสด', bank_transfer: 'โอนเงิน', card: 'บัตร' }
function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div className={'notice ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>{children}</div> }
function Field({ title, children }: { title: string; children: ReactNode }) { return <label className="field"><span>{title}</span>{children}</label> }
function Modal({ title, children, close, className = '' }: { title: string; children: ReactNode; close: () => void; className?: string }) {
  const dialog = useRef<HTMLElement>(null)
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close }, [close])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') || [])
    ;(dialog.current?.querySelector('input, select') as HTMLElement | null || focusable()[0])?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus() }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [])
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close() }}><section ref={dialog} className={'modal ' + className} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button onClick={close} aria-label="ปิด">×</button></header><div className="modal-body">{children}</div></section></div>
}
function Header({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) { return <header className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</header> }
function Pager({ page, data, change }: { page: number; data: Paged<unknown>; change: (n: number) => void }) { return <div className="pagination"><span>ทั้งหมด {data.total} รายการ · หน้า {page}</span><div><button type="button" disabled={page <= 1} onClick={() => change(page - 1)}>ก่อนหน้า</button><button type="button" disabled={page * data.limit >= data.total} onClick={() => change(page + 1)}>ถัดไป</button></div></div> }
function useList<T>(call: Call, path: string, setError: (s: string) => void) {
  const [data, setData] = useState<Paged<T> | null>(null)
  const [loading, setLoading] = useState(true)
  const state = useRef({ version: 0, controller: null as AbortController | null })
  const reload = useCallback(async () => {
    const current = state.current
    const version = ++current.version
    current.controller?.abort()
    current.controller = new AbortController()
    setLoading(true)
    try { const result = await call<Paged<T>>(path, { signal: current.controller.signal }); if (version === current.version) setData(result) }
    catch (e) { if (version === current.version && (e as ApiError).code !== 'CANCELLED') setError(errorText(e)) }
    finally { if (version === current.version) setLoading(false) }
  }, [call, path, setError])
  useEffect(() => {
    const current = state.current
    const id = window.setTimeout(() => void reload(), 0)
    return () => { window.clearTimeout(id); current.version++; current.controller?.abort() }
  }, [reload])
  return { data, loading, reload }
}

function PagedPicker<T extends { id: string }>({ call, path, title, value, change, label, setError, lookupPath, selectedLabel, disabled = false }: {
  call: Call; path: string; title: string; value: string; change: (id: string, item?: T) => void; label: (item: T) => string; setError: (s: string) => void; lookupPath?: string; selectedLabel?: string; disabled?: boolean
}) {
  const [page, setPage] = useState(1); const [q, setQ] = useState(''); const [search, setSearch] = useState('')
  const [saved, setSaved] = useState<T | null>(null)
  const separator = path.includes('?') ? '&' : '?'
  const { data, loading } = useList<T>(call, path + separator + query({ page, limit: 20, q: search }), setError)
  useEffect(() => {
    if (!value || !lookupPath) return
    let active = true
    const controller = new AbortController()
    void call<T>(lookupPath + '/' + value, { signal: controller.signal }).then(item => { if (active) setSaved(item) }).catch(e => { if (active && (e as ApiError).code !== 'CANCELLED') setError(errorText(e)) })
    return () => { active = false; controller.abort() }
  }, [value, lookupPath, call, setError])
  const options = data?.items || []
  const selected = options.find(item => item.id === value) || (saved?.id === value ? saved : null)
  return <div className="field paged-picker"><span>{title}</span><div className="picker-search"><input aria-label={'ค้นหา' + title} disabled={disabled} placeholder={'ค้นหา' + title} value={q} onChange={e => setQ(e.target.value)} /><button type="button" disabled={disabled} onClick={() => { setPage(1); setSearch(q) }}>ค้นหา</button></div><select aria-label={title} required disabled={disabled} value={value} onChange={e => { const item = options.find(item => item.id === e.target.value); if (item) setSaved(item); change(e.target.value, item) }}><option value="">{loading ? 'กำลังโหลด…' : 'เลือก' + title}</option>{value && !options.some(item => item.id === value) && <option value={value}>{selected ? label(selected) : selectedLabel || 'กำลังโหลดข้อมูลที่เลือก…'}</option>}{options.map(item => <option key={item.id} value={item.id}>{label(item)}</option>)}</select>{data && <Pager page={page} data={data} change={setPage} />}</div>
}

async function referenced<T>(call: Call, resource: string, ids: string[], signal?: AbortSignal) {
  return Promise.all(Array.from(new Set(ids.filter(Boolean))).map(id => call<T>(resource + '/' + id, { signal })))
}

function PaymentHistory({ call, bookingId, setError }: { call: Call; bookingId: string; setError: (value: string) => void }) {
  const [page, setPage] = useState(1); const [q, setQ] = useState('')
  const { data, loading } = useList<Transaction>(call, '/bookings/' + bookingId + '/payment/transactions?' + query({ page, limit: 20, q }), setError)
  return <section className="payment-history"><h4>ประวัติรับ–คืนเงิน</h4><input aria-label="ค้นหาเลขอ้างอิงการชำระเงิน" placeholder="ค้นหาเลขอ้างอิง" value={q} onChange={e => { setQ(e.target.value); setPage(1) }} />{loading ? <p className="loading">กำลังโหลด…</p> : data?.items.map(t => <div className="transaction" key={t.id}><span>{t.kind === 'receive' ? 'รับเงิน' : 'คืนเงิน'} · {names[t.method]} · {t.reference}</span><strong>{t.kind === 'receive' ? '+' : '−'}฿{money(t.amount)}</strong></div>)}{data && <Pager page={page} data={data} change={setPage} />}</section>
}

function App() {
  const [session, setSession] = useState<{ token: string; user: User; expires: number } | null>(null)
  const [roomChoice, setRoomChoice] = useState<RoomChoice | null>(null)
  const [requestedBooking, setRequestedBooking] = useState<string | null>(null)
  const clearRequestedBooking = useCallback(() => setRequestedBooking(null), [])
  const [staffPage, setStaffPage] = useState(() => window.location.hash === '#staff')
  const [memberPage, setMemberPage] = useState(() => ['#member', '#register'].includes(window.location.hash))
  const [registering, setRegistering] = useState(() => window.location.hash === '#register')
  const [memberName, setMemberName] = useState(''); const [confirmPassword, setConfirmPassword] = useState('')
  useEffect(() => { const update = () => { setMemberPage(['#member', '#register'].includes(window.location.hash)); setRegistering(window.location.hash === '#register') }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update) }, [])
  useEffect(() => { const update = () => setStaffPage(window.location.hash === '#staff'); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update) }, [])
  const [tab, setTab] = useState<Tab>('dashboard')
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const expire = useCallback(() => { setRoomChoice(null); setRequestedBooking(null); setSession(null); setTab('dashboard'); setError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง') }, [])
  useEffect(() => { if (!session) return; const id = window.setTimeout(expire, Math.max(0, session.expires - Date.now())); return () => window.clearTimeout(id) }, [session, expire])
  const call = useCallback(async <T,>(path: string, options?: { method?: string; body?: unknown; idempotencyKey?: string; signal?: AbortSignal }): Promise<T> => {
    if (!session || session.expires <= Date.now()) { expire(); throw new Error('เซสชันหมดอายุ') }
    try { return await request<T>(path, session.token, options) } catch (e) { if ((e as ApiError).status === 401) expire(); throw e }
  }, [session, expire])
  const action: Action = async (path, method, body, key) => { setError(''); setNotice(''); setBusy(true); try { await call(path, { method, body, idempotencyKey: key }); setNotice('บันทึกรายการสำเร็จ'); return true } catch (e) { setError(errorText(e)); return false } finally { setBusy(false) } }
  async function login(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { const r = await request<{ token: string; user: User; expiresIn: number }>('/auth/login', null, { method: 'POST', body: { email, password } }); setSession({ token: r.token, user: r.user, expires: Date.now() + r.expiresIn * 1000 }); setPassword('') } catch (err) { setError(errorText(err)) } finally { setBusy(false) } }
  async function register(e: FormEvent) {
    e.preventDefault(); setError('')
    if (password !== confirmPassword) { setError('รหัสผ่านและการยืนยันไม่ตรงกัน'); return }
    setBusy(true)
    try {
      await request('/auth/register', null, { method: 'POST', body: { name: memberName, email, password } })
      const result = await request<{ token: string; user: User; expiresIn: number }>('/auth/login', null, { method: 'POST', body: { email, password } })
      setSession({ token: result.token, user: result.user, expires: Date.now() + result.expiresIn * 1000 }); setPassword(''); setConfirmPassword(''); setRegistering(false); window.location.hash = 'member'
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  async function logout() { setRoomChoice(null); setRequestedBooking(null); if (session) await request('/auth/logout', session.token, { method: 'POST' }).catch(() => undefined); setSession(null); setTab('dashboard'); setError(''); setNotice('') }
  const openStaff = () => { window.location.hash = 'staff'; window.scrollTo(0, 0); setStaffPage(true); setMemberPage(false) }
  const openMember = () => { window.location.hash = 'member'; window.scrollTo(0, 0); setStaffPage(false); setMemberPage(true) }
  if (session?.user.role === 'customer') return memberPage ? <MemberAccount user={session.user} call={call} updated={user => setSession({ ...session, user })} logout={() => void logout()} back={() => { window.location.hash = 'discover'; setMemberPage(false) }} /> : <PublicHotel user={session.user} logout={() => void logout()} member={openMember} staff={() => { void logout().then(openStaff) }} />
  if (!session && !staffPage && !memberPage) return <PublicHotel member={openMember} staff={openStaff} />
  if (!session) return <main className="login-page"><a className="login-brand" href="#discover" onClick={() => setStaffPage(false)}><Brand /></a><form className="login-card" onSubmit={memberPage && registering ? register : login}><h2>{memberPage ? registering ? 'สมัครสมาชิก' : 'เข้าสู่ระบบสมาชิก' : 'ยินดีต้อนรับกลับ'}</h2><p>{memberPage ? 'บัญชีลูกค้า Lub d' : 'เข้าสู่ระบบจัดการโรงแรม'}</p>{error && <Notice error>{error}</Notice>}{memberPage && registering && <Field title="ชื่อ–นามสกุล"><input required maxLength={120} autoComplete="name" value={memberName} onChange={e => setMemberName(e.target.value)} /></Field>}<Field title="อีเมล"><input type="email" required autoComplete="username" placeholder="name@lubd.com" value={email} onChange={e => setEmail(e.target.value)} /></Field><Field title="รหัสผ่าน"><input type="password" required minLength={memberPage && registering ? 12 : undefined} autoComplete={memberPage && registering ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} /></Field>{memberPage && registering && <Field title="ยืนยันรหัสผ่าน"><input type="password" required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></Field>}<button className="primary wide" disabled={busy}>{busy ? 'กำลังดำเนินการ…' : memberPage && registering ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</button>{memberPage ? <><button type="button" className="text-button" onClick={() => { setError(''); window.location.hash = registering ? 'member' : 'register'; setRegistering(!registering) }}>{registering ? 'มีบัญชีแล้ว? เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัครสมาชิก'}</button><small>รหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร ไม่เกิน 72 ไบต์ UTF-8</small></> : <small>สำหรับ Admin และ Receptionist</small>}<small>หากเข้าใช้งานไม่ได้ กรุณาติดต่อผู้ดูแลระบบ</small></form></main>
  const nav: { id: Tab; label: string; icon: string; admin?: boolean }[] = [{ id: 'dashboard', label: 'ภาพรวม', icon: '◫' }, { id: 'bookings', label: 'การจอง', icon: '▤' }, { id: 'availability', label: 'ค้นหาห้องว่าง', icon: '' }, { id: 'guests', label: 'ผู้เข้าพัก', icon: '♙' }, { id: 'rooms', label: 'ห้องพัก / ประเภท', icon: '▦' }, { id: 'users', label: 'ผู้ใช้งาน', icon: '♧', admin: true }, { id: 'report', label: 'รายงาน', icon: '▥', admin: true }]
  return <div className="shell"><aside className="sidebar"><div className="brand"><Brand /></div><div className="nav-title">HOTEL OPERATIONS</div><nav aria-label="เมนูหลัก">{nav.filter(x => !x.admin || session.user.role === 'admin').map(x => <button key={x.id} className={'nav-item ' + (tab === x.id || (x.id === 'rooms' && tab === 'types') ? 'active' : '')} aria-current={tab === x.id || (x.id === 'rooms' && tab === 'types') ? 'page' : undefined} onClick={() => { setTab(x.id); setError(''); setNotice('') }}>{x.label}</button>)}</nav><div className="sidebar-foot"><div className="user-avatar">{session.user.name.slice(0, 1).toUpperCase()}</div><div><strong>{session.user.name}</strong><small>{session.user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงานต้อนรับ'}</small></div><button onClick={logout}>ออกจากระบบ</button></div></aside><main className="content"><div className="topbar"><strong>BANGKOK SIAM</strong><span>{new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span><span><i className="online-dot" />{session.user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงานต้อนรับ'}</span><button className="top-logout" onClick={logout}>ออกจากระบบ</button></div>{error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}{tab === 'dashboard' && <DashboardView call={call} user={session.user} go={(next, id) => { setRequestedBooking(id || null); setTab(next) }} />}{tab === 'availability' && <StaffAvailability call={call} select={choice => { setRoomChoice(choice); setTab('bookings') }} />}{tab === 'bookings' && <BookingsView key={roomChoice?.room.roomId || 'bookings'} requestedId={requestedBooking} clearRequested={clearRequestedBooking} choice={roomChoice} clearChoice={() => setRoomChoice(null)} call={call} action={action} busy={busy} setError={setError} />}{tab === 'guests' && <GuestsView call={call} action={action} busy={busy} setError={setError} />}{tab === 'rooms' && <RoomsView call={call} action={action} busy={busy} setError={setError} admin={session.user.role === 'admin'} typesPage={() => setTab('types')} />}{session.user.role === 'admin' && tab === 'types' && <><button className="text-button" onClick={() => setTab('rooms')}>← ห้องพักและประเภทห้อง</button><TypesView call={call} action={action} busy={busy} setError={setError} /></>}{session.user.role === 'admin' && tab === 'users' && <UsersView call={call} action={action} busy={busy} setError={setError} self={session.user.id} />}{session.user.role === 'admin' && tab === 'report' && <ReportView call={call} />}</main></div>
}

async function allBookings(call: Call, filters: Record<string, string>) {
  const items: Booking[] = []
  for (let page = 1; ; page++) {
    const result = await call<Paged<Booking>>('/bookings?' + query({ ...filters, page, limit: 100 }))
    items.push(...result.items)
    if (!result.items.length || page * result.limit >= result.total) return items
  }
}

function DashboardView({ call, user, go }: { call: Call; user: User; go: (t: Tab, id?: string) => void }) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    try {
      const dashboard = await call<Dashboard>('/dashboard')
      setData(dashboard)
      const [arrivals, departures] = await Promise.all([
        allBookings(call, { checkInFrom: dashboard.date, checkInTo: dashboard.date }),
        allBookings(call, { checkOutFrom: dashboard.date, checkOutTo: dashboard.date }),
      ])
      const rows = Array.from(new Map([...arrivals, ...departures].filter(b => b.status !== 'cancelled').map(b => [b.id, b])).values())
      const [guestList, roomList] = await Promise.all([referenced<Guest>(call, '/guests', rows.map(b => b.guestId)), referenced<Room>(call, '/rooms', rows.map(b => b.roomId))])
      setBookings(rows); setGuests(guestList); setRooms(roomList); setError('')
    } catch (e) { setError(errorText(e)) }
  }, [call])
  useEffect(() => { const id = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(id) }, [refresh])
  return <><Header eyebrow="" title={'สวัสดี ' + user.name + ' ☀'} description="ภาพรวมวันนี้ พร้อมดูแลทุกการเข้าพัก"><button onClick={() => void refresh()}>รีเฟรช</button></Header>{error && <Notice error>{error}</Notice>}{!data ? <p className="loading">กำลังโหลดข้อมูล…</p> : <><div className="metric-grid">{[['ห้องว่าง', data.availableRooms, 'พร้อมเข้าพักคืนนี้'], ['มีผู้เข้าพัก', data.occupiedRooms, 'สถานะห้องปัจจุบัน'], ['เช็กอินวันนี้', data.arrivalsToday, 'ตามกำหนดวันเข้าพัก'], ['เช็กเอาต์วันนี้', data.departuresToday, 'ตามกำหนดวันออก']].map(([label, value, sub]) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>)}</div><section className="dashboard-stays"><h2>การเข้าพักวันนี้</h2><button className="primary" onClick={() => go('availability')}>+ สร้างการจอง</button><div className="panel table-wrap"><table><thead><tr><th>ผู้เข้าพัก / การจอง</th><th>ห้อง</th><th>วันเข้า–ออก</th><th>สถานะ</th><th>ดำเนินการ</th></tr></thead><tbody>{bookings.map(b => <tr key={b.id}><td>{guests.find(g => g.id === b.guestId)?.fullName || 'ผู้เข้าพัก'} / #{b.id.slice(-6).toUpperCase()}</td><td>{rooms.find(r => r.id === b.roomId)?.roomNumber || '—'}</td><td>{b.checkInDate} – {b.checkOutDate}</td><td>{names[b.status]}</td><td><button className="text-button" onClick={() => go('bookings', b.id)}>ดูการจอง →</button></td></tr>)}</tbody></table>{!bookings.length && <p className="empty">ยังไม่มีการเข้าหรือออกตามกำหนดวันนี้</p>}</div></section></>}</>
}

function useSearchVersion() {
  const version = useRef({ current: 0 })
  useEffect(() => { const state = version.current; return () => { state.current++ } }, [])
  return { next: () => ++version.current.current, isCurrent: (value: number) => value === version.current.current }
}

function StaffAvailability({ call, select }: { call: Call; select: (choice: RoomChoice) => void }) {
  const [form, setForm] = useState({ checkInDate: hotelToday(), checkOutDate: nextDay(hotelToday()), guestCount: 2 })
  const [searched, setSearched] = useState<typeof form | null>(null)
  const [data, setData] = useState<Paged<AvailableRoom> | null>(null)
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [page, setPage] = useState(1)
  const searchVersion = useSearchVersion()
  function changeStay(next: typeof form) {
    searchVersion.next()
    setForm(next); setData(null); setSearched(null); setBusy(false); setError('')
  }
  async function search(e?: FormEvent, targetPage = 1) {
    e?.preventDefault(); const stay = targetPage === 1 ? { ...form } : searched!
    if (stay.checkOutDate <= stay.checkInDate) { setError('วันเช็กเอาต์ต้องอยู่หลังวันเช็กอิน'); return }
    const version = searchVersion.next()
    setBusy(true); setError(''); setData(null)
    try {
      const result = await call<Paged<AvailableRoom>>('/rooms/availability?' + query({ ...stay, page: targetPage, limit: 12 }))
      if (!searchVersion.isCurrent(version)) return
      setData(result); setSearched(stay); setPage(targetPage)
    } catch (err) { if (searchVersion.isCurrent(version)) setError(errorText(err)) }
    finally { if (searchVersion.isCurrent(version)) setBusy(false) }
  }
  return <><Header eyebrow="" title="ค้นหาห้องว่าง" description="1 เลือกห้อง → 2 ผู้เข้าพัก → 3 ตรวจสอบและยืนยัน" /><form className="panel staff-availability-form" onSubmit={e => void search(e)}><Field title="เช็กอิน"><input type="date" required value={form.checkInDate} onChange={e => changeStay({ ...form, checkInDate: e.target.value })} /></Field><Field title="เช็กเอาต์"><input type="date" required min={form.checkInDate ? nextDay(form.checkInDate) : undefined} value={form.checkOutDate} onChange={e => changeStay({ ...form, checkOutDate: e.target.value })} /></Field><Field title="ผู้เข้าพัก"><input type="number" min="1" max="20" required value={form.guestCount} onChange={e => changeStay({ ...form, guestCount: Number(e.target.value) })} /></Field><button className="primary" disabled={busy}>{busy ? 'กำลังค้นหา…' : 'ค้นหา'}</button></form>{error && <Notice error>{error}</Notice>}{data && searched && <><h2 style={{ fontSize: 22, marginTop: 24 }}>พบ {data.total} ห้องว่างสำหรับ {searched.guestCount} คน</h2><div className="staff-room-grid">{data.items.map(room => <article className="staff-room-card" key={room.roomId}><span className="pill good">พร้อมจอง</span><h3>{room.roomType}</h3><p>ห้อง {room.roomNumber}</p><p>สูงสุด {room.capacity} คน</p><strong>฿{money(room.pricePerNight)} / คืน</strong><button className="primary" onClick={() => select({ room, ...searched })}>เลือกห้องนี้ →</button></article>)}</div>{!data.items.length && <p className="empty">ไม่พบห้องว่าง ลองเปลี่ยนช่วงวันที่หรือจำนวนผู้เข้าพัก</p>}<Pager page={page} data={data} change={n => void search(undefined, n)} /><p className="public-help">แสดงเฉพาะห้องพร้อมใช้งาน · ตรวจสอบวันว่างอีกครั้งเมื่อยืนยัน</p></>}</>
}

function GuestsView({ call, action, busy, setError }: Shared) {
  const [page, setPage] = useState(1); const [q, setQ] = useState(''); const [search, setSearch] = useState('')
  const { data, loading, reload } = useList<Guest>(call, '/guests?' + query({ page, q: search }), setError)
  const [editing, setEditing] = useState<Guest | null>(null); const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', documentNo: '' })
  function edit(g?: Guest) { setEditing(g || null); setForm({ fullName: g?.fullName || '', phone: g?.phone || '', email: g?.email || '', documentNo: '' }); setOpen(true) }
  async function save(e: FormEvent) { e.preventDefault(); const body = editing ? { fullName: form.fullName, phone: form.phone, email: form.email || null, ...(form.documentNo ? { documentNo: form.documentNo } : {}) } : { ...form, email: form.email || null }; if (await action(editing ? '/guests/' + editing.id : '/guests', editing ? 'PATCH' : 'POST', body)) { setOpen(false); void reload() } }
  return <><Header eyebrow="GUEST MANAGEMENT" title="ผู้เข้าพัก" description="ค้นหา เพิ่ม และแก้ไขข้อมูลผู้เข้าพัก"><button className="primary" onClick={() => edit()}>＋ เพิ่มผู้เข้าพัก</button></Header><section className="panel"><form className="toolbar" onSubmit={e => { e.preventDefault(); setPage(1); setSearch(q) }}><input aria-label="ค้นหาชื่อหรือเบอร์โทร" placeholder="ค้นหาชื่อหรือเบอร์โทร" value={q} onChange={e => setQ(e.target.value)} /><button>ค้นหา</button></form>{loading ? <p className="loading">กำลังโหลด…</p> : data?.items.length ? <><div className="table-wrap"><table><thead><tr><th>ชื่อผู้เข้าพัก</th><th>โทรศัพท์</th><th>เอกสาร</th><th>สถานะ</th><th /></tr></thead><tbody>{data.items.map(g => <tr key={g.id}><td><strong>{g.fullName}</strong><small>{g.email}</small></td><td>{g.phone}</td><td>{g.documentNoMasked || '—'}</td><td><span className={'pill ' + (g.active ? 'good' : '')}>{g.active ? 'ใช้งาน' : 'เก็บถาวร'}</span></td><td><button className="text-button" onClick={() => edit(g)}>แก้ไข</button></td></tr>)}</tbody></table></div><Pager page={page} data={data} change={setPage} /></> : <div className="empty">ยังไม่มีผู้เข้าพักที่ตรงกับการค้นหา</div>}</section>{open && <Modal title={editing ? 'แก้ไขผู้เข้าพัก' : 'เพิ่มผู้เข้าพัก'} close={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field title="ชื่อ–นามสกุล"><input required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></Field><Field title="โทรศัพท์"><input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field><Field title="อีเมล (ถ้ามี)"><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field><Field title={editing ? 'เลขเอกสารใหม่ (เว้นว่างเพื่อคงเดิม)' : 'เลขเอกสาร'}><input required={!editing} value={form.documentNo} onChange={e => setForm({ ...form, documentNo: e.target.value })} /></Field><div className="form-actions"><button type="button" onClick={() => setOpen(false)}>ยกเลิก</button><button className="primary" disabled={busy}>บันทึก</button></div></form></Modal>}</>
}

function BookingsView({ call, action, busy, setError, choice, clearChoice, requestedId, clearRequested }: Shared & { choice: RoomChoice | null; clearChoice: () => void; requestedId?: string | null; clearRequested?: () => void }) {
  const [page, setPage] = useState(1); const [status, setStatus] = useState('')
  const { data, loading, reload } = useList<Booking>(call, '/bookings?' + query({ page, status }), setError)
  const [guests, setGuests] = useState<Guest[]>([]); const [selected, setSelected] = useState<Booking | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [open, setOpen] = useState(!!choice); const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ guestId: '', roomId: choice?.room.roomId || '', guestCount: choice?.guestCount || 1, checkInDate: choice?.checkInDate || hotelToday(), checkOutDate: choice?.checkOutDate || nextDay(hotelToday()) })
  const [available, setAvailable] = useState<AvailableRoom[] | null>(choice ? [choice.room] : null); const [searching, setSearching] = useState(false)
  const [availablePage, setAvailablePage] = useState<Paged<AvailableRoom> | null>(null); const [roomPage, setRoomPage] = useState(1)
  const [chosenRoom, setChosenRoom] = useState<AvailableRoom | null>(choice?.room || null)
  const [review, setReview] = useState(false)
  const roomSearchVersion = useSearchVersion()
  function resetRoomSearch() { roomSearchVersion.next(); setAvailable(null); setAvailablePage(null); setChosenRoom(null); setSearching(false) }
  const sameStay = editing && selected && selected.roomId === form.roomId && selected.checkInDate === form.checkInDate && selected.checkOutDate === form.checkOutDate
  const roomDetails = available?.find(r => r.roomId === form.roomId) || (chosenRoom?.roomId === form.roomId ? chosenRoom : null)
  const reviewPrice = sameStay ? selected.totalPrice : (roomDetails?.pricePerNight ?? 0) * ((Date.parse(form.checkOutDate) - Date.parse(form.checkInDate)) / 86400000)
  const [moneyMode, setMoneyMode] = useState<'receive' | 'refund' | null>(null)
  const [moneyForm, setMoneyForm] = useState({ amount: '', method: 'cash', reference: '', receiptId: '', reason: '' })
  const [moneyKey, setMoneyKey] = useState<string | null>(null); const [occurredAt, setOccurredAt] = useState('')
  useEffect(() => {
    if (!data) return
    let active = true; const controller = new AbortController()
    void referenced<Guest>(call, '/guests', data.items.map(b => b.guestId), controller.signal).then(items => { if (active) setGuests(previous => Array.from(new Map([...previous, ...items].map(g => [g.id, g])).values())) }).catch(e => { if (active && (e as ApiError).code !== 'CANCELLED') setError(errorText(e)) })
    return () => { active = false; controller.abort() }
  }, [data, call, setError])
  useEffect(() => {
    if (!selected) return
    let active = true; const controller = new AbortController()
    void call<Guest>('/guests/' + selected.guestId, { signal: controller.signal }).then(guest => { if (active) setGuests(previous => [...previous.filter(g => g.id !== guest.id), guest]) }).catch(e => { if (active && (e as ApiError).code !== 'CANCELLED') setError(errorText(e)) })
    return () => { active = false; controller.abort() }
  }, [selected, call, setError])
  const detailState = useRef({ version: 0, id: null as string | null, controller: null as AbortController | null, active: true })
  const [detailLoading, setDetailLoading] = useState(false)
  const invalidateDetail = useCallback(() => { const state = detailState.current; state.version++; state.id = null; state.controller?.abort() }, [])
  useEffect(() => { const state = detailState.current; state.active = true; return () => { state.active = false; state.version++; state.controller?.abort() } }, [])
  const detail = useCallback(async (id: string) => {
    const state = detailState.current
    const version = ++state.version
    state.controller?.abort(); state.controller = new AbortController(); state.id = id
    setSelected(null); setPayment(null); setMoneyMode(null); setMoneyKey(null); setDetailLoading(true)
    try {
      const options = { signal: state.controller.signal }
      const [b, p] = await Promise.all([call<Booking>('/bookings/' + id, options), call<Payment>('/bookings/' + id + '/payment', options)])
      if (state.active && version === state.version) { setSelected(b); setPayment(p) }
    } catch (e) { if (state.active && version === state.version && (e as ApiError).code !== 'CANCELLED') setError(errorText(e)) }
    finally { if (state.active && version === state.version) setDetailLoading(false) }
  }, [call, setError])
  useEffect(() => { if (!requestedId) return; const timer = window.setTimeout(() => { void detail(requestedId); clearRequested?.() }, 0); return () => window.clearTimeout(timer) }, [requestedId, clearRequested, detail])
  async function findRooms(targetPage = 1) {
    const version = roomSearchVersion.next()
    setSearching(true)
    try {
      const d = await call<Paged<AvailableRoom>>('/rooms/availability?' + query({ checkInDate: form.checkInDate, checkOutDate: form.checkOutDate, guestCount: form.guestCount, ...(editing && selected ? { excludeBookingId: selected.id } : {}), page: targetPage, limit: 20 }))
      if (!roomSearchVersion.isCurrent(version)) return
      setAvailable(d.items); setAvailablePage(d); setRoomPage(targetPage)
      if (targetPage === 1 && !sameStay && !d.items.some(r => r.roomId === form.roomId)) { setForm(f => ({ ...f, roomId: '' })); setChosenRoom(null) }
    } catch (e) { if (roomSearchVersion.isCurrent(version)) setError(errorText(e)) }
    finally { if (roomSearchVersion.isCurrent(version)) setSearching(false) }
  }
  function create() { invalidateDetail(); setSelected(null); setDetailLoading(false); setReview(false); setEditing(false); setForm({ guestId: '', roomId: '', guestCount: 1, checkInDate: hotelToday(), checkOutDate: nextDay(hotelToday()) }); resetRoomSearch(); setOpen(true) }
  function edit() { if (!selected) return; setReview(false); setEditing(true); setForm({ guestId: selected.guestId, roomId: selected.roomId, guestCount: selected.guestCount, checkInDate: selected.checkInDate, checkOutDate: selected.checkOutDate }); resetRoomSearch(); setOpen(true) }
  async function save(e: FormEvent) { e.preventDefault(); if (!form.roomId) { setError('กรุณาค้นหาและเลือกห้องว่าง'); return } if (!review) { setReview(true); return } const ok = await action(editing ? '/bookings/' + selected?.id : '/bookings', editing ? 'PATCH' : 'POST', form); if (ok) { resetRoomSearch(); setOpen(false); clearChoice(); void reload(); if (selected && detailState.current.id === selected.id) void detail(selected.id) } else { setReview(false); await findRooms() } }
  async function operate(path: string) { if (!selected) return; const id = selected.id; if (await action('/bookings/' + id + '/' + path, 'POST', {})) { if (detailState.current.id === id) await detail(id); void reload() } }
  function startMoney(mode: 'receive' | 'refund') { setMoneyMode(mode); setMoneyForm({ amount: '', method: 'cash', reference: '', receiptId: '', reason: '' }); setMoneyKey(null); setOccurredAt('') }
  async function submitMoney(e: FormEvent) { e.preventDefault(); if (!selected || !moneyMode) return; const key = moneyKey || crypto.randomUUID(); const time = occurredAt || new Date().toISOString(); setMoneyKey(key); setOccurredAt(time); const body = { amount: Number(moneyForm.amount), method: moneyForm.method, reference: moneyForm.reference, occurredAt: time, ...(moneyMode === 'refund' ? { receiptId: moneyForm.receiptId, reason: moneyForm.reason } : {}) }; if (await action('/bookings/' + selected.id + '/payment/' + (moneyMode === 'receive' ? 'receipts' : 'refunds'), 'POST', body, key)) { if (detailState.current.id === selected.id) { setMoneyMode(null); setMoneyKey(null); await detail(selected.id) } void reload() } }
  return <><Header eyebrow="RESERVATIONS" title="การจอง" description="ค้นหาห้องว่างและดูแลการเข้าพักตั้งแต่ต้นจนจบ"><button className="primary" onClick={create}>＋ สร้างการจอง</button></Header><section className="panel"><div className="toolbar"><Field title="สถานะ"><select value={status} onChange={e => { setPage(1); setStatus(e.target.value) }}><option value="">ทั้งหมด</option>{['confirmed', 'checked_in', 'checked_out', 'cancelled'].map(s => <option key={s} value={s}>{names[s]}</option>)}</select></Field><button onClick={reload}>↻ รีเฟรช</button></div>{loading ? <p className="loading">กำลังโหลด…</p> : data?.items.length ? <><div className="table-wrap"><table><thead><tr><th>รหัสจอง</th><th>ผู้เข้าพัก</th><th>วันเข้าพัก</th><th>ยอดรวม</th><th>สถานะ</th><th /></tr></thead><tbody>{data.items.map(b => <tr key={b.id}><td><strong>#{b.id.slice(-6).toUpperCase()}</strong></td><td>{guests.find(g => g.id === b.guestId)?.fullName || b.guestId.slice(-6)}</td><td>{b.checkInDate} → {b.checkOutDate}</td><td>฿{money(b.totalPrice)}</td><td><span className={'pill ' + (b.status === 'checked_in' ? 'good' : 'blue')}>{names[b.status]}</span></td><td><button className="text-button" onClick={() => void detail(b.id)}>รายละเอียด</button></td></tr>)}</tbody></table></div><Pager page={page} data={data} change={setPage} /></> : <div className="empty">ยังไม่มีรายการจองในสถานะนี้</div>}</section>{detailLoading && <Notice>กำลังโหลดรายละเอียดการจอง…</Notice>}{open && <Modal className="booking-modal" title={review ? 'ตรวจสอบและยืนยัน' : editing ? 'แก้ไขการจอง' : 'ข้อมูลผู้เข้าพัก'} close={() => { resetRoomSearch(); setOpen(false); clearChoice() }}><form className="form-grid booking-form" onSubmit={save}>{!review && form.roomId && <section className="stay-preview full"><h3>การเข้าพักของคุณ</h3><strong>{roomDetails?.roomType} / ห้อง {roomDetails?.roomNumber}</strong><p>{form.checkInDate} → {form.checkOutDate} · {form.guestCount} คน</p></section>}{review ? <section className="full booking-review"><h3>พร้อมสำหรับการเข้าพักครั้งใหม่</h3><div className="detail-grid"><div><small>ผู้เข้าพัก</small><strong>{guests.find(g => g.id === form.guestId)?.fullName}</strong></div><div><small>ห้องพัก</small><strong>{roomDetails?.roomType} / ห้อง {roomDetails?.roomNumber}</strong></div><div><small>วันเข้า–ออก</small><strong>{form.checkInDate} → {form.checkOutDate} · {form.guestCount} คน</strong></div><div><small>ยอดรวมโดยประมาณ</small><strong>฿{money(reviewPrice)}</strong></div></div><p>การชำระเงิน: รอชำระ · ตรวจสอบห้องว่างและราคาจริงอีกครั้งเมื่อยืนยัน</p></section> : <><PagedPicker<Guest> call={call} path="/guests?active=true" lookupPath="/guests" title="ผู้เข้าพัก" value={form.guestId} setError={setError} label={g => g.fullName + ' · ' + g.phone} change={(id, guest) => { setForm({ ...form, guestId: id }); if (guest) setGuests(items => [...items.filter(g => g.id !== id), guest]) }} /><Field title="จำนวนคน"><input type="number" min="1" max="20" required value={form.guestCount} onChange={e => { setForm({ ...form, guestCount: Number(e.target.value), roomId: '' }); resetRoomSearch() }} /></Field><Field title="เช็กอิน"><input type="date" required value={form.checkInDate} onChange={e => { setForm({ ...form, checkInDate: e.target.value, roomId: '' }); resetRoomSearch() }} /></Field><Field title="เช็กเอาต์"><input type="date" required value={form.checkOutDate} onChange={e => { setForm({ ...form, checkOutDate: e.target.value, roomId: '' }); resetRoomSearch() }} /></Field><button type="button" className="full" disabled={searching} onClick={() => void findRooms()}>{searching ? 'กำลังค้นหา…' : 'ค้นหาห้องว่าง'}</button>{available && <Field title="ห้องว่าง"><select required value={form.roomId} onChange={e => { setForm({ ...form, roomId: e.target.value }); setChosenRoom(available?.find(r => r.roomId === e.target.value) || null) }}><option value="">{available.length ? 'เลือกห้อง' : 'ไม่พบห้องว่าง'}</option>{[...available, ...(chosenRoom && !available.some(r => r.roomId === chosenRoom.roomId) ? [chosenRoom] : [])].map(r => <option key={r.roomId} value={r.roomId}>ห้อง {r.roomNumber} · {r.roomType} · ฿{money(r.pricePerNight)}/คืน · {r.capacity} คน</option>)}</select></Field>}{availablePage && <div className="full"><Pager page={roomPage} data={availablePage} change={n => void findRooms(n)} /></div>}</>}<div className="form-actions"><button type="button" onClick={() => { if (review) setReview(false); else { resetRoomSearch(); setOpen(false); clearChoice() } }}>{review ? '← แก้ไขข้อมูล' : 'ยกเลิก'}</button><button className="primary" disabled={busy || !form.roomId}>{busy ? 'กำลังบันทึก…' : review ? 'ยืนยันการจอง ✓' : 'ตรวจสอบการจอง →'}</button></div></form></Modal>}{selected && !open && <Modal className="booking-modal" title={'การจอง #' + selected.id.slice(-6).toUpperCase()} close={() => { invalidateDetail(); setSelected(null); setMoneyMode(null); setDetailLoading(false) }}><div className="detail-grid"><div><small>ผู้เข้าพัก</small><strong>{guests.find(g => g.id === selected.guestId)?.fullName || selected.guestId}</strong></div><div><small>สถานะ</small><strong>{names[selected.status]}</strong></div><div><small>วันเข้าพัก</small><strong>{selected.checkInDate} → {selected.checkOutDate}</strong></div><div><small>ยอดรวม</small><strong>฿{money(selected.totalPrice)}</strong></div></div>{payment && <section className="payment-box"><h3>การชำระเงิน</h3><div className="payment-numbers"><span>รับสุทธิ <strong>฿{money(payment.net)}</strong></span><span>คงเหลือ <strong>฿{money(payment.remaining)}</strong></span></div>{!payment.ledgerReady && <Notice error>ต้องตรวจสอบหลักฐานยอดเงินเดิมก่อนทำรายการ</Notice>}<PaymentHistory key={selected.id} call={call} bookingId={selected.id} setError={setError} /></section>}{!moneyMode && <div className="detail-actions">{selected.status === 'confirmed' && <><button onClick={edit}>แก้ไข</button><button onClick={() => startMoney('receive')}>รับเงิน</button><button onClick={() => startMoney('refund')}>คืนเงิน</button><button disabled={busy} onClick={() => void operate('check-in')}>เช็กอิน</button><button className="danger" disabled={busy} onClick={() => { if (window.confirm('ยืนยันยกเลิกการจองนี้? ต้องคืนเงินให้ครบก่อน')) void operate('cancel') }}>ยกเลิกจอง</button></>}{selected.status === 'checked_in' && <><button onClick={() => startMoney('receive')}>รับเงิน</button><button className="primary" disabled={busy} onClick={() => void operate('check-out')}>เช็กเอาต์</button></>}</div>}{moneyMode && <form className="form-grid money-form" onSubmit={submitMoney}><h3 className="full">{moneyMode === 'receive' ? 'บันทึกรับเงิน' : 'บันทึกคืนเงิน'}</h3><Notice>บันทึกเมื่อมีหลักฐานเงินจริงแล้ว หากเครือข่ายขาดให้กดส่งซ้ำด้วยข้อมูลเดิม</Notice>{moneyMode === 'refund' && <PagedPicker<Transaction> key={selected.id} call={call} path={'/bookings/' + selected.id + '/payment/transactions?kind=receive'} title="รายการรับเงินต้นทาง" value={moneyForm.receiptId} setError={setError} label={t => t.reference + ' · ฿' + money(t.amount)} change={id => { setMoneyForm({ ...moneyForm, receiptId: id }); setMoneyKey(null) }} />}<Field title="จำนวนเงิน (บาท)"><input type="number" min="1" step="1" required value={moneyForm.amount} onChange={e => { setMoneyForm({ ...moneyForm, amount: e.target.value }); setMoneyKey(null) }} /></Field><Field title="วิธีชำระ"><select value={moneyForm.method} onChange={e => { setMoneyForm({ ...moneyForm, method: e.target.value }); setMoneyKey(null) }}>{['cash', 'bank_transfer', 'card'].map(m => <option key={m} value={m}>{names[m]}</option>)}</select></Field><Field title="เลขอ้างอิงหลักฐาน"><input required maxLength={128} value={moneyForm.reference} onChange={e => { setMoneyForm({ ...moneyForm, reference: e.target.value }); setMoneyKey(null) }} /></Field>{moneyMode === 'refund' && <Field title="เหตุผลการคืนเงิน"><input required maxLength={500} value={moneyForm.reason} onChange={e => { setMoneyForm({ ...moneyForm, reason: e.target.value }); setMoneyKey(null) }} /></Field>}<div className="form-actions"><button type="button" onClick={() => { setMoneyMode(null); setMoneyKey(null) }}>กลับ</button><button className="primary" disabled={busy}>บันทึก{moneyMode === 'receive' ? 'รับเงิน' : 'คืนเงิน'}</button></div></form>}</Modal>}</>
}

function RoomsView({ call, action, busy, admin, setError, typesPage }: Shared & { admin: boolean; typesPage: () => void }) {
  const [page, setPage] = useState(1); const [q, setQ] = useState(''); const [search, setSearch] = useState('')
  const { data, loading, reload } = useList<Room>(call, '/rooms?' + query({ page, q: search }), setError)
  const [types, setTypes] = useState<RoomType[]>([]); const [typePage, setTypePage] = useState(1)
  const { data: typeData } = useList<RoomType>(call, '/room-types?' + query({ active: 'true', page: typePage, limit: 20 }), setError)
  const [editing, setEditing] = useState<Room | null>(null); const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ roomNumber: '', floor: 1, roomTypeId: '', status: 'available', active: true })
  useEffect(() => {
    if (!data) return
    let active = true; const controller = new AbortController()
    void referenced<RoomType>(call, '/room-types', data.items.map(r => r.roomTypeId), controller.signal).then(items => { if (active) setTypes(items) }).catch(e => { if (active && (e as ApiError).code !== 'CANCELLED') setError(errorText(e)) })
    return () => { active = false; controller.abort() }
  }, [data, call, setError])
  function edit(r?: Room) { setEditing(r || null); setForm({ roomNumber: r?.roomNumber || '', floor: r?.floor ?? 1, roomTypeId: r?.roomTypeId || '', status: r?.status === 'occupied' ? 'available' : r?.status || 'available', active: r?.active ?? true }); setOpen(true) }
  async function save(e: FormEvent) { e.preventDefault(); const body = editing ? { ...(form.roomNumber !== editing.roomNumber ? { roomNumber: form.roomNumber } : {}), ...(form.floor !== editing.floor ? { floor: form.floor } : {}), ...(editing.status === 'occupied' ? {} : { ...(form.roomTypeId !== editing.roomTypeId ? { roomTypeId: form.roomTypeId } : {}), ...(form.status !== editing.status ? { status: form.status } : {}), ...(form.active !== editing.active ? { active: form.active } : {}) }) } : { roomNumber: form.roomNumber, floor: form.floor, roomTypeId: form.roomTypeId, status: form.status }; if (!Object.keys(body).length) { setOpen(false); return } if (await action(editing ? '/rooms/' + editing.id : '/rooms', editing ? 'PATCH' : 'POST', body)) { setOpen(false); void reload() } }
  return <><Header eyebrow="ROOM INVENTORY" title="ห้องพักและประเภทห้อง" description="ตรวจสถานะห้องพัก · Admin จัดการข้อมูล / Receptionist ดูและค้นหา">{admin && <button className="primary" onClick={() => edit()}>＋ เพิ่มห้องพัก</button>}</Header><section className="panel"><form className="toolbar" onSubmit={e => { e.preventDefault(); setPage(1); setSearch(q) }}><input aria-label="ค้นหาเลขห้อง" placeholder="ค้นหาเลขห้อง" value={q} onChange={e => setQ(e.target.value)} /><button>ค้นหา</button></form>{loading ? <p className="loading">กำลังโหลด…</p> : data?.items.length ? <><div className="table-wrap"><table><thead><tr><th>ห้อง</th><th>ประเภท</th><th>ชั้น</th><th>สถานะ</th><th /></tr></thead><tbody>{data.items.map(r => <tr key={r.id}><td><strong>{r.roomNumber}</strong></td><td>{types.find(t => t.id === r.roomTypeId)?.name || '—'}</td><td>{r.floor ?? '—'}</td><td><span className={'pill ' + (r.status === 'available' ? 'good' : 'blue')}>{names[r.status] || r.status}</span></td><td>{admin && <button className="text-button" onClick={() => edit(r)}>แก้ไข</button>}</td></tr>)}</tbody></table></div><Pager page={page} data={data} change={setPage} /></> : <div className="empty">ยังไม่มีห้องพักที่ตรงกับการค้นหา</div>}</section><section className="room-types-section"><h2>ประเภทห้อง</h2><div className="room-type-grid">{typeData?.items.map(t => <article className="panel room-type-card" key={t.id}><h3>{t.name}</h3><p>฿{money(t.basePrice)} / คืน · {t.capacity} คน</p><small>{t.amenities.join(' · ')}</small>{admin && <button className="text-button" onClick={typesPage}>ดู / แก้ไขประเภท →</button>}</article>)}</div>{typeData && <Pager page={typePage} data={typeData} change={setTypePage} />}{admin && <button onClick={typesPage}>จัดการประเภทห้องทั้งหมด →</button>}</section>{open && <Modal title={editing ? 'แก้ไขห้องพัก' : 'เพิ่มห้องพัก'} close={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field title="เลขห้อง"><input required value={form.roomNumber} onChange={e => setForm({ ...form, roomNumber: e.target.value })} /></Field><Field title="ชั้น"><input type="number" min="-20" max="300" required value={form.floor} onChange={e => setForm({ ...form, floor: Number(e.target.value) })} /></Field><PagedPicker<RoomType> call={call} path="/room-types?active=true" lookupPath="/room-types" title="ประเภทห้อง" value={form.roomTypeId} selectedLabel={types.find(t => t.id === form.roomTypeId)?.name} disabled={editing?.status === 'occupied'} setError={setError} label={t => t.name} change={id => setForm({ ...form, roomTypeId: id })} />{editing?.status !== 'occupied' && <Field title="สถานะ"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="available">พร้อมใช้งาน</option><option value="maintenance">ซ่อมบำรุง</option></select></Field>}{editing && editing.status !== 'occupied' && <Field title="การใช้งาน"><select value={String(form.active)} onChange={e => setForm({ ...form, active: e.target.value === 'true' })}><option value="true">ใช้งาน</option><option value="false">ปิดใช้งาน</option></select></Field>}<div className="form-actions"><button type="button" onClick={() => setOpen(false)}>ยกเลิก</button><button className="primary" disabled={busy}>บันทึก</button></div></form></Modal>}</>
}

function TypesView({ call, action, busy, setError }: Shared) {
  const [page, setPage] = useState(1); const [q, setQ] = useState('')
  const { data, loading, reload } = useList<RoomType>(call, '/room-types?' + query({ page, q }), setError)
  const [editing, setEditing] = useState<RoomType | null>(null); const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', capacity: 2, basePrice: 0, amenities: '', active: true })
  function edit(t?: RoomType) { setEditing(t || null); setForm({ name: t?.name || '', capacity: t?.capacity || 2, basePrice: t?.basePrice || 0, amenities: t?.amenities.join(', ') || '', active: t?.active ?? true }); setOpen(true) }
  async function save(e: FormEvent) { e.preventDefault(); const body = { name: form.name, capacity: form.capacity, basePrice: form.basePrice, amenities: form.amenities.split(',').map(x => x.trim()).filter(Boolean), ...(editing ? { active: form.active } : {}) }; if (await action(editing ? '/room-types/' + editing.id : '/room-types', editing ? 'PATCH' : 'POST', body)) { setOpen(false); void reload() } }
  return <><Header eyebrow="ADMIN / ROOM TYPES" title="ประเภทห้อง" description="กำหนดความจุและราคาต่อคืน"><button className="primary" onClick={() => edit()}>＋ เพิ่มประเภท</button></Header><section className="panel"><div className="toolbar"><input aria-label="ค้นหา" placeholder="ค้นหา" value={q} onChange={e => { setPage(1); setQ(e.target.value) }} /></div>{loading ? <p className="loading">กำลังโหลด…</p> : data?.items.length ? <><div className="table-wrap"><table><thead><tr><th>ประเภท</th><th>ความจุ</th><th>ราคา/คืน</th><th>สถานะ</th><th /></tr></thead><tbody>{data.items.map(t => <tr key={t.id}><td><strong>{t.name}</strong><small>{t.amenities.join(' · ')}</small></td><td>{t.capacity} คน</td><td>฿{money(t.basePrice)}</td><td><span className={'pill ' + (t.active ? 'good' : '')}>{t.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td><td><button className="text-button" onClick={() => edit(t)}>แก้ไข</button></td></tr>)}</tbody></table></div><Pager page={page} data={data} change={setPage} /></> : <div className="empty">ยังไม่มีประเภทห้อง</div>}</section>{open && <Modal title={editing ? 'แก้ไขประเภทห้อง' : 'เพิ่มประเภทห้อง'} close={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field title="ชื่อประเภท"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field><Field title="ความจุ (คน)"><input type="number" min="1" max="20" required value={form.capacity} onChange={e => setForm({ ...form, capacity: Number(e.target.value) })} /></Field><Field title="ราคา/คืน (บาท)"><input type="number" min="0" max="2147483647" step="1" required value={form.basePrice} onChange={e => setForm({ ...form, basePrice: Number(e.target.value) })} /></Field><Field title="สิ่งอำนวยความสะดวก (คั่นด้วย ,)"><input value={form.amenities} onChange={e => setForm({ ...form, amenities: e.target.value })} /></Field>{editing && <Field title="การใช้งาน"><select value={String(form.active)} onChange={e => setForm({ ...form, active: e.target.value === 'true' })}><option value="true">ใช้งาน</option><option value="false">ปิดใช้งาน</option></select></Field>}<div className="form-actions"><button type="button" onClick={() => setOpen(false)}>ยกเลิก</button><button className="primary" disabled={busy}>บันทึก</button></div></form></Modal>}</>
}

function UsersView({ call, action, busy, setError, self }: Shared & { self: string }) {
  const [page, setPage] = useState(1); const [q, setQ] = useState('')
  const { data, loading, reload } = useList<User>(call, '/users?' + query({ page, q }), setError)
  const [editing, setEditing] = useState<User | null>(null); const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'receptionist', active: true })
  function edit(u?: User) { setEditing(u || null); setForm({ name: u?.name || '', email: u?.email || '', password: '', role: u?.role || 'receptionist', active: u?.active ?? true }); setOpen(true) }
  async function save(e: FormEvent) { e.preventDefault(); const body = editing ? { name: form.name, email: form.email, role: form.role, active: form.active, ...(form.password ? { password: form.password } : {}) } : { name: form.name, email: form.email, role: form.role, password: form.password }; if (await action(editing ? '/users/' + editing.id : '/users', editing ? 'PATCH' : 'POST', body)) { setOpen(false); void reload() } }
  return <><Header eyebrow="ADMIN / ACCESS" title="ผู้ใช้งาน" description="จัดการบัญชีและสิทธิ์ของทีม"><button className="primary" onClick={() => edit()}>＋ เพิ่มผู้ใช้</button></Header><section className="panel"><div className="toolbar"><input aria-label="ค้นหา" placeholder="ค้นหา" value={q} onChange={e => { setPage(1); setQ(e.target.value) }} /></div>{loading ? <p className="loading">กำลังโหลด…</p> : data?.items.length ? <><div className="table-wrap"><table><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th><th>สถานะ</th><th /></tr></thead><tbody>{data.items.map(u => <tr key={u.id}><td><strong>{u.name}</strong>{u.id === self && <small>บัญชีของคุณ</small>}</td><td>{u.email}</td><td>{u.role === 'admin' ? 'ผู้ดูแลระบบ' : u.role === 'customer' ? 'สมาชิก' : 'พนักงานต้อนรับ'}</td><td><span className={'pill ' + (u.active ? 'good' : '')}>{u.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td><td><button className="text-button" onClick={() => edit(u)}>แก้ไข</button></td></tr>)}</tbody></table></div><Pager page={page} data={data} change={setPage} /></> : <div className="empty">ยังไม่มีผู้ใช้งาน</div>}</section>{open && <Modal title={editing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'} close={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field title="ชื่อ"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field><Field title="อีเมล"><input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field><Field title={editing ? 'รหัสผ่านใหม่ (เว้นว่างเพื่อคงเดิม)' : 'รหัสผ่าน (อย่างน้อย 12 ตัวอักษร)'}><input type="password" minLength={12} required={!editing} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></Field><Field title="สิทธิ์"><select disabled={editing?.id === self} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="receptionist">พนักงานต้อนรับ</option><option value="admin">ผู้ดูแลระบบ</option><option value="customer">สมาชิก</option></select></Field>{editing && <Field title="สถานะ"><select disabled={editing.id === self} value={String(form.active)} onChange={e => setForm({ ...form, active: e.target.value === 'true' })}><option value="true">ใช้งาน</option><option value="false">ปิดใช้งาน</option></select></Field>}<div className="form-actions"><button type="button" onClick={() => setOpen(false)}>ยกเลิก</button><button className="primary" disabled={busy}>บันทึก</button></div></form></Modal>}</>
}

function ReportView({ call }: { call: Call }) { const [data, setData] = useState<Report | null>(null); const [error, setError] = useState(''); const refresh = useCallback(async () => { try { setData(await call<Report>('/dashboard/report')); setError('') } catch (e) { setError(errorText(e)) } }, [call]); useEffect(() => { const id = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(id) }, [refresh]); return <><Header eyebrow="ADMIN / REPORTS" title="รายงานการชำระเงิน" description="ยอดจากหลักฐานรับและคืนเงินทั้งหมดในระบบ"><button onClick={refresh}>↻ รีเฟรช</button></Header>{error && <Notice error>{error}</Notice>}{!data ? <p className="loading">กำลังโหลด…</p> : <><div className="metric-grid">{[['รับเงิน', data.receivedBaht], ['คืนเงิน', data.refundedBaht], ['ยอดสุทธิ', data.netBaht], ['รายการรอตรวจสอบ', data.unreconciledPayments]].map(([label, value], i) => <div className="metric" key={label}><span>{label}</span><strong>{i === 3 ? value : '฿' + money(Number(value))}</strong></div>)}</div><Notice>รายงานนี้แสดงยอดตาม ledger ตลอดเวลา ไม่ใช่รายงานรับรู้รายได้</Notice></>}</> }
export default App
