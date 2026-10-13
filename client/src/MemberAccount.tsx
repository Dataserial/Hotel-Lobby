import { navigate } from './navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorText, type CustomerBooking, type Paged, type RequestOptions, type User } from './api'
import { Brand } from './Brand'
import AccountMenu from './AccountMenu'

const statusLabel: Record<string, string> = { confirmed: 'ยืนยันแล้ว', checked_in: 'เข้าพักแล้ว', checked_out: 'เช็กเอาต์แล้ว', cancelled: 'ยกเลิกแล้ว', pending: 'รอชำระที่โรงแรม', paid: 'ชำระแล้ว', refunded: 'คืนเงินแล้ว' }
export default function MemberAccount({ user, call, updated, logout, back }: { user: User; call: <T>(path: string, options?: RequestOptions) => Promise<T>; updated: (user: User) => void; logout: () => void; back: () => void }) {
  const [name, setName] = useState(user.name); const [email, setEmail] = useState(user.email)
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<{ key: string; data?: Paged<CustomerBooking>; error?: string } | null>(null)
  const resultKey = user.id + ':' + page + ':' + refresh
  const bookings = result?.key === resultKey ? result.data : undefined
  const bookingError = result?.key === resultKey ? result.error : undefined
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    void call<Paged<CustomerBooking>>('/customer/bookings?page=' + page, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ key: resultKey, data })
    }).catch(e => { if (!controller.signal.aborted) setResult({ key: resultKey, error: errorText(e) }) })
    return () => controller.abort()
  }, [call, page, resultKey])
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('')
    pending.current?.abort()
    const controller = new AbortController(); pending.current = controller
    try { const result = await call<{ user: User }>('/auth/profile', { method: 'PATCH', body: { name, email }, signal: controller.signal }); if (controller.signal.aborted) return; updated(result.user); setNotice('บันทึกข้อมูลสมาชิกแล้ว') }
    catch (e) { if (!controller.signal.aborted) setError(errorText(e)) } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <main className="member-page"><header className="member-header floating-navbar"><a className="home-link" href="/" aria-label="Lub d หน้าแรก"><Brand /></a><div><button onClick={back}>ดูห้องพัก</button><AccountMenu user={user} account={() => { navigate('/member') }} logout={logout} /></div></header><section className="panel member-card"><span className="eyebrow">บัญชีสมาชิก</span><h1>สวัสดี {user.name}</h1><p>จัดการข้อมูลบัญชีของคุณ และค้นหาห้องพักจากหน้าโรงแรม</p>{error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}<form onSubmit={save} className="form-grid"><label className="field"><span>ชื่อ–นามสกุล</span><input required maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label><label className="field"><span>อีเมล</span><input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label><div className="form-actions"><button className="primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}</button></div></form>
    <section aria-labelledby="my-bookings"><h2 id="my-bookings">การจองของฉัน</h2><p>หากต้องการแก้ไขหรือยกเลิกการจอง กรุณาติดต่อพนักงาน</p>
      {bookingError && <div className="notice error" role="alert">{bookingError} <button onClick={() => setRefresh(value => value + 1)}>ลองอีกครั้ง</button></div>}
      {!bookings && !bookingError && <p role="status">กำลังโหลดการจอง…</p>}
      {bookings && (bookings.items.length ? <div className="my-bookings">{bookings.items.map(booking => <article key={booking.id}><strong>{booking.roomType} · ห้อง {booking.roomNumber}</strong><p>เลขอ้างอิง {booking.id}</p><p>{booking.checkInDate} – {booking.checkOutDate} · ฿{booking.totalPrice.toLocaleString('th-TH')}</p><p>สถานะ {statusLabel[booking.status] || booking.status} · {statusLabel[booking.paymentStatus] || booking.paymentStatus}</p></article>)}</div> : <p>ยังไม่มีการจอง</p>)}
      {bookings && bookings.total > bookings.limit && <nav aria-label="หน้าการจอง"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>หน้าก่อน</button><span> หน้า {page} </span><button disabled={page * bookings.limit >= bookings.total} onClick={() => setPage(value => value + 1)}>หน้าถัดไป</button></nav>}
    </section></section></main>
}
