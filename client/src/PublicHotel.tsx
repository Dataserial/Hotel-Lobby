import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { errorText, query, request, type AvailableRoom, type Paged } from './api'
import { Brand } from './Brand'
import './PublicHotel.css'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const tomorrow = (date: string) => new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
const money = (amount: number) => new Intl.NumberFormat('th-TH').format(amount)
const dateLabel = (date: string) => new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'))
type Stay = { checkInDate: string; checkOutDate: string; guestCount: number }

export default function PublicHotel({ staff }: { staff: () => void }) {
  const intro = useRef<HTMLElement>(null)
  const discover = useRef<HTMLElement>(null)
  const results = useRef<HTMLElement>(null)
  const contact = useRef<HTMLDialogElement>(null)
  const [progress, setProgress] = useState(0)
  const [form, setForm] = useState<Stay>(() => ({ checkInDate: today(), checkOutDate: tomorrow(today()), guestCount: 2 }))
  const [stay, setStay] = useState<Stay | null>(null)
  const [rooms, setRooms] = useState<Paged<AvailableRoom> | null>(null)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AvailableRoom | null>(null)
  const searchVersion = useRef({ version: 0 })
  useEffect(() => {
    const searches = searchVersion.current
    let frame = 0
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setProgress(Math.min(1, Math.max(0, -(intro.current?.getBoundingClientRect().top || 0) / window.innerHeight)))) }
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    update()
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update); window.removeEventListener('resize', update); searches.version++ }
  }, [])
  useEffect(() => {
    if (stay) results.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }, [stay])
  async function search(event?: FormEvent, targetPage = 1, snapshot?: Stay) {
    event?.preventDefault()
    const searched = snapshot || (targetPage === 1 ? { ...form } : stay!)
    const nights = (Date.parse(searched.checkOutDate) - Date.parse(searched.checkInDate)) / 86400000
    if (!Number.isInteger(nights) || nights < 1 || nights > 365) { setError('กรุณาเลือกวันเช็กเอาต์หลังวันเช็กอิน โดยพักได้ 1–365 คืน'); return }
    const version = ++searchVersion.current.version
    setBusy(true); setError(''); setRooms(null); setStay(searched)
    try {
      const data = await request<Paged<AvailableRoom>>('/public/rooms/availability?' + query({ ...searched, page: targetPage, limit: 12 }), null)
      if (version === searchVersion.current.version) { setRooms(data); setPage(targetPage) }
    } catch (err) { if (version === searchVersion.current.version) setError(errorText(err)) }
    finally { if (version === searchVersion.current.version) setBusy(false) }
  }
  function showContact(room: AvailableRoom) { setSelected(room); contact.current?.showModal() }
  const nights = stay ? (Date.parse(stay.checkOutDate) - Date.parse(stay.checkInDate)) / 86400000 : 0
  return <main className="public-hotel">
    <section ref={intro} className="moon-journey" aria-label="ยินดีต้อนรับสู่ Lub d">
      <div className="moon-night" style={{ '--journey': progress } as CSSProperties}>
        <img className="intro-moon" src="/figma/moon.svg" alt="พระจันทร์" />
        <p className="moon-quote">“พักให้เต็มที่ แล้วเริ่มวันใหม่”</p>
        <button className="scroll-start" onClick={() => discover.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>เลื่อนลงเพื่อเริ่มต้น ↓</button>
      </div>
    </section>
    <section ref={discover} id="discover" className="discover-section">
      <header className="hotel-header"><a href="#discover" aria-label="Lub d หน้าแรก"><Brand publicLogo /></a><button className="staff-profile" onClick={staff} aria-label="เข้าสู่ระบบพนักงาน"><img src="/figma/profile.svg" alt="" /><span>พนักงาน</span></button></header>
      <div className="discover-heading"><h1>A GOOD STAY. <br className="mobile-break" />A GREAT DAY.</h1><p className="desktop-copy">พักใจกลางเมือง แล้วออกไปพบเรื่องราวใหม่</p><p className="mobile-copy">ค้นพบห้องพักที่ใช่ ใจกลางกรุงเทพฯ</p></div>
      <div className="hotel-gallery" aria-label="ภาพโรงแรม"><picture><source media="(max-width: 680px)" srcSet="/figma/hotel-mobile.png" /><img src="/figma/hotel.png" alt="อาคาร Lub d Bangkok Siam ในยามค่ำคืน" /></picture><img src="/figma/pool.png" alt="สระว่ายน้ำและพื้นที่พักผ่อนของโรงแรม" /><div className="lobby-photo"><img src="/figma/lobby.png" alt="ล็อบบี้และพื้นที่ส่วนกลาง" /></div></div>
      <div className="discover-search"><form className="availability-search" onSubmit={e => void search(e)}>
        <label className="field"><span>วันเช็กอิน</span><input type="date" required value={form.checkInDate} onChange={e => { const value = e.target.value; setForm(f => ({ ...f, checkInDate: value, checkOutDate: value && value >= f.checkOutDate ? tomorrow(value) : f.checkOutDate })) }} /></label>
        <label className="field"><span>วันเช็กเอาต์</span><input type="date" required min={form.checkInDate ? tomorrow(form.checkInDate) : undefined} value={form.checkOutDate} onChange={e => setForm({ ...form, checkOutDate: e.target.value })} /></label>
        <label className="field"><span>จำนวนผู้เข้าพัก</span><select value={form.guestCount} onChange={e => setForm({ ...form, guestCount: Number(e.target.value) })}>{Array.from({ length: 20 }, (_, i) => <option key={i} value={i + 1}>{i + 1} คน</option>)}</select></label>
        <button className="primary" disabled={busy}>{busy ? 'กำลังค้นหา…' : <><span className="desktop-copy">ค้นหาโรงแรม</span><span className="mobile-copy">ค้นหาห้องว่าง →</span></>}</button>
      </form><p className="hotel-amenities">Wi-Fi ฟรี  •  ใกล้ BTS สนามกีฬาแห่งชาติ  •  พื้นที่ส่วนกลาง 24 ชั่วโมง</p></div>
    </section>
    <section ref={results} className="public-results" aria-live="polite" aria-busy={busy} hidden={!stay && !error}>
      <h2>ห้องพักสำหรับคืนที่ดีของคุณ</h2>
      {stay && <p className="stay-summary">{dateLabel(stay.checkInDate)} – {dateLabel(stay.checkOutDate)} · {nights} คืน · {stay.guestCount} คน</p>}
      {error && <div className="notice error" role="alert">{error}<button onClick={() => void search()}>ลองอีกครั้ง</button></div>}
      {busy && <p className="loading">กำลังค้นหาห้องพักสำหรับคุณ…</p>}
      {rooms && <>{rooms.items.length ? <><div className="public-room-grid">{rooms.items.map(room => <article className="public-room-card" key={room.roomId}>
        <span className="room-crescent" aria-hidden="true">☾</span><h3>{room.roomType}</h3><p>สูงสุด {room.capacity} คน · ห้อง {room.roomNumber}</p><span className="pill good">พร้อมจอง</span><strong>฿{money(room.pricePerNight)} / คืน</strong><p className="room-total">รวม {nights} คืน ฿{money(room.pricePerNight * nights)} · ติดต่อพนักงานเพื่อยืนยัน</p><button className="primary" onClick={() => showContact(room)}>ติดต่อพนักงาน</button>
      </article>)}</div><div className="pagination"><span>พบ {rooms.total} ห้อง · หน้า {page}</span><div><button disabled={busy || page === 1} onClick={() => void search(undefined, page - 1, stay!)}>ก่อนหน้า</button><button disabled={busy || page * rooms.limit >= rooms.total} onClick={() => void search(undefined, page + 1, stay!)}>ถัดไป</button></div></div></> : <div className="public-empty"><h3>ยังไม่มีห้องว่างในช่วงวันที่เลือก</h3><p>ลองเปลี่ยนวันที่หรือจำนวนผู้เข้าพัก แล้วค้นหาอีกครั้ง</p><button onClick={() => discover.current?.scrollIntoView()}>เปลี่ยนการค้นหา</button></div>}<p className="public-help">ต้องการความช่วยเหลือ? ติดต่อเคาน์เตอร์โรงแรมเพื่อยืนยันการจอง</p></>}
    </section>
    <dialog ref={contact} className="contact-dialog" aria-labelledby="contact-title"><div><button className="dialog-close" onClick={() => contact.current?.close()} aria-label="ปิด">×</button><span className="eyebrow">LUB D · BANGKOK SIAM</span><h2 id="contact-title">ติดต่อเคาน์เตอร์โรงแรม</h2><p>แจ้งรายละเอียดนี้กับพนักงาน เพื่อให้ตรวจห้องว่างและยืนยันการจอง</p>{selected && stay && <dl><dt>ห้องพัก</dt><dd>{selected.roomType} · ห้อง {selected.roomNumber}</dd><dt>วันเข้าพัก</dt><dd>{dateLabel(stay.checkInDate)} – {dateLabel(stay.checkOutDate)}</dd><dt>ผู้เข้าพัก</dt><dd>{stay.guestCount} คน · {nights} คืน</dd><dt>ราคารวม</dt><dd>฿{money(selected.pricePerNight * nights)}</dd></dl>}<p>ผลค้นหานี้ยังไม่ได้สำรองห้อง กรุณาติดต่อพนักงานก่อนยืนยัน</p><button className="primary" onClick={() => contact.current?.close()}>เข้าใจแล้ว</button></div></dialog>
  </main>
}
