import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorText, query, request, type ApiError, type BookingRoomType, type CustomerBooking, type RoomGrid, type User } from './api'
import { roomPhoto } from './roomPhotos'
import { Brand } from './Brand'
import AccountMenu from './AccountMenu'
import './PublicHotel.css'
import './RoomAvailability.css'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const tomorrow = (day: string) => day && Number.isFinite(Date.parse(day)) ? new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10) : ''
const money = (value: number) => new Intl.NumberFormat('th-TH').format(value)
type Dates = { checkInDate: string; checkOutDate: string }
type Draft = Dates & { roomTypeId: string; roomId: string }
const draftKey = 'hotel-lobby-booking-draft'
function storeDraft(value: Draft | null) {
  try { if (value) sessionStorage.setItem(draftKey, JSON.stringify(value)); else sessionStorage.removeItem(draftKey) } catch { /* Booking remains usable without browser storage. */ }
}
function readDraft(): Draft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(draftKey) || 'null')
    if (!value || !['checkInDate', 'checkOutDate', 'roomTypeId', 'roomId'].every(field => typeof value[field] === 'string')) return null
    const count = (Date.parse(value.checkOutDate) - Date.parse(value.checkInDate)) / 86400000
    if (value.checkInDate < today() || !Number.isInteger(count) || count < 1 || count > 365) return null
    return { checkInDate: value.checkInDate, checkOutDate: value.checkOutDate, roomTypeId: value.roomTypeId, roomId: value.roomId }
  } catch { return null }
}

export default function PublicHotel({ staff, member, user = null, token = null, logout, reauthenticate, customerLogin }: { staff: () => void; member?: () => void; user?: User | null; token?: string | null; logout?: () => void; reauthenticate?: () => void; customerLogin?: () => void }) {
  const [saved] = useState(readDraft)
  const [dates, setDates] = useState<Dates>(() => saved ? { checkInDate: saved.checkInDate, checkOutDate: saved.checkOutDate } : { checkInDate: today(), checkOutDate: tomorrow(today()) })
  const [searched, setSearched] = useState<Dates | null>(() => saved ? { checkInDate: saved.checkInDate, checkOutDate: saved.checkOutDate } : null)
  const [typesResult, setTypesResult] = useState<{ key: string; items?: BookingRoomType[]; error?: string } | null>(null)
  const [typeRefresh, setTypeRefresh] = useState(0)
  const [typeId, setTypeId] = useState(saved?.roomTypeId || '')
  const [gridResult, setGridResult] = useState<{ key: string; data?: RoomGrid; error?: string } | null>(null)
  const [gridRefresh, setGridRefresh] = useState(0)
  const [roomId, setRoomId] = useState(saved?.roomId || '')
  const [phone, setPhone] = useState('')
  const [documentNo, setDocumentNo] = useState('')
  const [booking, setBooking] = useState<CustomerBooking | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [priceChanged, setPriceChanged] = useState(false)
  const key = useRef(crypto.randomUUID())
  const sending = useRef(false)
  const section = useRef<HTMLElement>(null)
  const parameters = searched ? query(searched) : ''
  const typesKey = parameters + ':' + typeRefresh
  const gridKey = parameters + ':' + typeId + ':' + gridRefresh
  const types = typesResult?.key === typesKey ? typesResult.items : undefined
  const typesError = typesResult?.key === typesKey ? typesResult.error : undefined
  const grid = gridResult?.key === gridKey ? gridResult.data : undefined
  const gridError = gridResult?.key === gridKey ? gridResult.error : undefined
  const selectedRoom = grid?.items.find(room => room.roomId === roomId && room.status === 'available')
  const selectedType = types?.find(type => type.id === typeId)
  const nights = searched ? (Date.parse(searched.checkOutDate) - Date.parse(searched.checkInDate)) / 86400000 : 0
  useEffect(() => {
    if (!parameters) return
    const controller = new AbortController()
    void request<{ items: BookingRoomType[] }>('/public/rooms/grid/types?' + parameters, null, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setTypesResult({ key: typesKey, items: value.items })
    }).catch(err => { if (!controller.signal.aborted) setTypesResult({ key: typesKey, error: errorText(err) }) })
    return () => controller.abort()
  }, [parameters, typesKey])
  useEffect(() => {
    if (!parameters || !typeId) return
    const controller = new AbortController()
    void request<RoomGrid>('/public/rooms/grid?' + parameters + '&' + query({ roomTypeId: typeId }), null, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) {
        setGridResult({ key: gridKey, data: value })
        setRoomId(current => value.items.some(room => room.roomId === current && room.status === 'available') ? current : '')
      }
    }).catch(err => { if (!controller.signal.aborted) setGridResult({ key: gridKey, error: errorText(err) }) })
    return () => controller.abort()
  }, [parameters, typeId, gridKey])
  useEffect(() => { if (searched) section.current?.scrollIntoView({ behavior: 'smooth' }) }, [searched])
  function clearSelection(next: Dates) {
    setDates(next); setSearched(null); setTypeId(''); setRoomId(''); setBooking(null); setError(''); setPriceChanged(false)
    storeDraft(null); key.current = crypto.randomUUID()
  }
  function findTypes(event?: FormEvent) {
    event?.preventDefault()
    const count = (Date.parse(dates.checkOutDate) - Date.parse(dates.checkInDate)) / 86400000
    if (dates.checkInDate < today() || !Number.isInteger(count) || count < 1 || count > 365) { setError('กรุณาเลือกวันพักตั้งแต่วันนี้ จำนวน 1–365 คืน'); return }
    setError(''); setSearched({ ...dates }); setTypeRefresh(value => value + 1); setTypeId(''); setRoomId(''); setBooking(null); setPriceChanged(false)
    storeDraft(null); key.current = crypto.randomUUID()
  }
  function selectType(id: string) {
    setError(''); setTypeId(id); setRoomId(''); setBooking(null); setPriceChanged(false); setGridRefresh(value => value + 1)
    storeDraft(null); key.current = crypto.randomUUID()
  }
  function selectRoom(id: string) {
    setRoomId(id); setBooking(null); setError(''); setPriceChanged(false); key.current = crypto.randomUUID()
    if (searched) storeDraft({ ...searched, roomTypeId: typeId, roomId: id })
  }
  async function confirm(event: FormEvent) {
    event.preventDefault()
    if (sending.current || !searched || !selectedRoom || !grid || user?.role !== 'customer') return
    if (!token) { reauthenticate?.(); return }
    sending.current = true; setSubmitting(true); setError('')
    try {
      const result = await request<CustomerBooking>('/customer/bookings', token, { method: 'POST', idempotencyKey: key.current, body: { roomId, ...searched, phone, documentNo, expectedPricePerNight: grid.roomType.pricePerNight } })
      setBooking(result); setDocumentNo(''); storeDraft(null)
    } catch (err) {
      setError(errorText(err))
      const failure = err as ApiError
      if (failure.code === 'ROOM_UNAVAILABLE') { setRoomId(''); setGridRefresh(value => value + 1); storeDraft(null); key.current = crypto.randomUUID() }
      if (failure.code === 'PRICE_CHANGED') { setPriceChanged(true); setGridRefresh(value => value + 1); setTypeRefresh(value => value + 1); key.current = crypto.randomUUID() }
      if (failure.status === 401) reauthenticate?.()
    } finally { sending.current = false; setSubmitting(false) }
  }
  return <main className="public-hotel">
    <header className="hotel-header floating-navbar"><a className="home-link" href="/" aria-label="Lub d หน้าแรก"><Brand publicLogo /></a><div className="hotel-account-actions">{user ? <AccountMenu user={user} account={member} logout={logout} /> : <><button onClick={member}>สมัครสมาชิก / เข้าสู่ระบบ</button><button onClick={staff}>พนักงาน</button></>}</div></header>
    <section className="discover-section" id="discover"><div className="discover-heading"><h1>A GOOD STAY.<br />A GREAT DAY.</h1><p>เลือกวันพัก ประเภทห้อง แล้วเลือกห้องที่ใช่</p></div><div className="hotel-gallery"><img src="/figma/hotel.png" alt="โรงแรม Lub d Bangkok Siam" /><img src="/figma/pool.png" alt="พื้นที่พักผ่อน" /></div>
      <ol className="booking-steps" aria-label="ขั้นตอนการจอง">{['เลือกวัน', 'เลือกประเภทห้อง', 'เลือกเลขห้อง', 'ยืนยันจอง'].map((label, index) => <li key={label} aria-current={(booking || selectedRoom ? 3 : typeId ? 2 : searched ? 1 : 0) === index ? 'step' : undefined}>{index + 1}. {label}</li>)}</ol>
      <div className="discover-search"><form className="availability-search" onSubmit={findTypes}><label className="field"><span>วันเช็กอิน</span><input type="date" required disabled={submitting} min={today()} value={dates.checkInDate} onChange={e => { const start = e.target.value; clearSelection({ checkInDate: start, checkOutDate: start >= dates.checkOutDate ? tomorrow(start) : dates.checkOutDate }) }} /></label><label className="field"><span>วันเช็กเอาต์</span><input type="date" required disabled={submitting} min={tomorrow(dates.checkInDate) || undefined} value={dates.checkOutDate} onChange={e => clearSelection({ ...dates, checkOutDate: e.target.value })} /></label><button className="primary" disabled={submitting}>เลือกประเภทห้อง</button></form></div>
    </section>
    <section ref={section} className="public-results" aria-labelledby="booking-types">
      <h2 id="booking-types">เลือกประเภทห้อง</h2>{searched && <p className="stay-summary">{searched.checkInDate} – {searched.checkOutDate} · {nights} คืน</p>}
      {error && <div className="notice error" role="alert">{error}</div>}
      {typesError && <div className="notice error" role="alert">{typesError} <button onClick={() => setTypeRefresh(value => value + 1)}>ลองอีกครั้ง</button></div>}
      {searched && !types && !typesError && <p role="status">กำลังโหลดประเภทห้อง…</p>}
      {types?.length === 0 && <p role="status">ยังไม่มีประเภทห้องที่เปิดใช้งาน กรุณาติดต่อพนักงาน</p>}
      <div className="room-type-summary-grid">{types?.map(type => <article key={type.id} className="room-type-card"><div className="room-type-photo"><img src={roomPhoto(type.name)} alt={'ภาพประกอบ ' + type.name} /><small>ภาพประกอบ</small></div><div className="room-type-content"><h3>{type.name}</h3><p>สูงสุด {type.capacity} คน · ฿{money(type.pricePerNight)} / คืน</p><p>{type.availableRooms ? `ว่าง ${type.availableRooms} จาก ${type.totalRooms} ห้อง` : 'ห้องเต็มในช่วงวันที่เลือก'}</p><p className="room-type-amenities">{type.amenities.join(' · ')}</p><button type="button" disabled={submitting} aria-pressed={typeId === type.id} aria-controls="booking-room-grid" onClick={() => selectType(type.id)}>เลือก {type.name}</button></div></article>)}</div>
      {typeId && <section id="booking-room-grid" aria-labelledby="room-grid-title"><h2 id="room-grid-title">เลือกเลขห้อง {selectedType?.name}</h2>{gridError && <div className="notice error" role="alert">{gridError} <button onClick={() => setGridRefresh(value => value + 1)}>ลองอีกครั้ง</button></div>}{!grid && !gridError && <p role="status">กำลังโหลดห้อง…</p>}{grid && <><p>เลือกหนึ่งห้องที่ว่างครบ {nights} คืน</p>{grid.items.length === 0 && <p role="status">ไม่มีห้องที่เปิดใช้งานในประเภทนี้</p>}<div className="room-number-grid" role="group" aria-label="เลือกเลขห้อง">{grid.items.map(room => <button key={room.roomId} type="button" disabled={submitting || room.status !== 'available'} aria-pressed={roomId === room.roomId} className={'room-number ' + room.status} onClick={() => selectRoom(room.roomId)}>ห้อง {room.roomNumber}<small>{room.status === 'available' ? 'ว่าง' : room.status === 'maintenance' ? 'ซ่อมบำรุง' : 'ไม่ว่าง'}</small></button>)}</div></>}</section>}
      {selectedRoom && grid && searched && !booking && <section className="booking-confirm" aria-labelledby="confirm-title"><h2 id="confirm-title">ยืนยันการจอง</h2><p>{grid.roomType.name} · ห้อง {selectedRoom.roomNumber} · {searched.checkInDate} – {searched.checkOutDate}</p><p>{nights} คืน · ฿{money(grid.roomType.pricePerNight)} / คืน · รวม ฿{money(nights * grid.roomType.pricePerNight)}</p><p>จำนวนผู้พักตามความจุห้อง: {grid.roomType.capacity} คน · ชำระที่โรงแรม</p>{priceChanged && <p className="notice" role="status">แสดงราคาใหม่แล้ว กรุณาตรวจยอดรวมและกดยืนยันราคาใหม่เพื่อจอง</p>}{user?.role !== 'customer' ? <button className="primary" onClick={customerLogin || member}>เข้าสู่ระบบหรือสมัครสมาชิกเพื่อจอง</button> : <form className="form-grid" onSubmit={confirm}><p>ผู้จอง: {user.name} · {user.email}</p><label className="field"><span>เบอร์โทร</span><input type="tel" autoComplete="tel" required disabled={submitting} maxLength={30} value={phone} onChange={e => { setPhone(e.target.value); key.current = crypto.randomUUID() }} /></label><label className="field"><span>เลขบัตรประชาชนหรือพาสปอร์ต</span><input autoComplete="off" required disabled={submitting} minLength={5} maxLength={64} value={documentNo} onChange={e => { setDocumentNo(e.target.value); key.current = crypto.randomUUID() }} /></label><button className="primary" disabled={submitting}>{submitting ? 'กำลังจอง…' : priceChanged ? 'ยืนยันราคาใหม่และจอง · ชำระที่โรงแรม' : 'ยืนยันจอง · ชำระที่โรงแรม'}</button></form>}</section>}
      {booking && <div className="booking-confirm" role="status"><h2>จองสำเร็จ</h2><p>เลขอ้างอิง {booking.id} · {booking.roomType} · ห้อง {booking.roomNumber}</p><p>{booking.checkInDate} – {booking.checkOutDate} · รวม ฿{money(booking.totalPrice)}</p><p>สถานะ: ยืนยันแล้ว · ชำระที่โรงแรม</p><p>หากต้องการแก้ไขหรือยกเลิก กรุณาติดต่อพนักงาน</p><button onClick={member}>ดูการจองของฉัน</button></div>}
    </section>
  </main>
}
