import { navigate } from './navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorText, type CustomerBooking, type RequestOptions, type User } from './api'
import { Brand } from './Brand'
import AccountMenu from './AccountMenu'

export default function MemberAccount({ user, call, updated, logout, back }: { user: User; call: <T>(path: string, options?: RequestOptions) => Promise<T>; updated: (user: User) => void; logout: () => void; back: () => void }) {
  const [name, setName] = useState(user.name); const [email, setEmail] = useState(user.email)
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const [bookings, setBookings] = useState<CustomerBooking[]>([])
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => { const controller = new AbortController(); void call<{ items: CustomerBooking[] }>('/customer/bookings', { signal: controller.signal }).then(data => setBookings(data.items)).catch(e => { if (!controller.signal.aborted) setError(errorText(e)) }); return () => controller.abort() }, [call])
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('')
    pending.current?.abort()
    const controller = new AbortController(); pending.current = controller
    try { const result = await call<{ user: User }>('/auth/profile', { method: 'PATCH', body: { name, email }, signal: controller.signal }); if (controller.signal.aborted) return; updated(result.user); setNotice('บันทึกข้อมูลสมาชิกแล้ว') }
    catch (e) { if (!controller.signal.aborted) setError(errorText(e)) } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <main className="member-page"><header className="member-header floating-navbar"><a className="home-link" href="/" aria-label="Lub d หน้าแรก"><Brand /></a><div><button onClick={back}>ดูห้องพัก</button><AccountMenu user={user} account={() => { navigate('/member') }} logout={logout} /></div></header><section className="panel member-card"><span className="eyebrow">บัญชีสมาชิก</span><h1>สวัสดี {user.name}</h1><p>จัดการข้อมูลบัญชีของคุณ และค้นหาห้องพักจากหน้าโรงแรม</p>{error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}<form onSubmit={save} className="form-grid"><label className="field"><span>ชื่อ–นามสกุล</span><input required maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label><label className="field"><span>อีเมล</span><input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label><div className="form-actions"><button className="primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}</button></div></form><section aria-labelledby="my-bookings"><h2 id="my-bookings">การจองของฉัน</h2>{bookings.length ? <div className="my-bookings">{bookings.map(booking => <article key={booking.id}><strong>{booking.roomType} · ห้อง {booking.roomNumber}</strong><p>เลขอ้างอิง {booking.id}</p><p>{booking.checkInDate} – {booking.checkOutDate} · ฿{booking.totalPrice.toLocaleString('th-TH')}</p><p>สถานะ {booking.status === 'confirmed' ? 'ยืนยันแล้ว' : booking.status} · {booking.paymentStatus === 'pending' ? 'ชำระที่โรงแรม' : booking.paymentStatus}</p></article>)}</div> : <p>ยังไม่มีการจอง</p>}</section></section></main>
}
