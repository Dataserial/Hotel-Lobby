import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorText, query, request, type CustomerBooking, type RoomAvailabilitySummary, type RoomGrid, type User } from './api'
import { roomPhoto } from './roomPhotos'
import { Brand } from './Brand'
import AccountMenu from './AccountMenu'
import './PublicHotel.css'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const tomorrow = (day: string) => new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
const money = (value: number) => new Intl.NumberFormat('th-TH').format(value)
type Dates = { checkInDate: string; checkOutDate: string }
type Draft = Dates & { roomTypeId: string; roomId: string }
const draftKey = 'hotel-lobby-booking-draft'
function readDraft(): Draft | null { try { const value = JSON.parse(sessionStorage.getItem(draftKey) || 'null'); return value && typeof value.roomId === 'string' ? value : null } catch { return null } }

export default function PublicHotel({ staff, member, user = null, token = null, logout }: { staff: () => void; member?: () => void; user?: User | null; token?: string | null; logout?: () => void }) {
  const [saved] = useState(readDraft)
  const [dates, setDates] = useState<Dates>(() => saved || { checkInDate: today(), checkOutDate: tomorrow(today()) })
  const [searched, setSearched] = useState<Dates | null>(() => saved)
  const [types, setTypes] = useState<RoomAvailabilitySummary['roomTypes']>([])
  const [typeId, setTypeId] = useState(saved?.roomTypeId || '')
  const [grid, setGrid] = useState<RoomGrid | null>(null)
  const [gridRefresh, setGridRefresh] = useState(0)
  const [roomId, setRoomId] = useState(saved?.roomId || '')
  const [phone, setPhone] = useState('')
  const [documentNo, setDocumentNo] = useState('')
  const [booking, setBooking] = useState<CustomerBooking | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const key = useRef(crypto.randomUUID())
  const requestVersion = useRef(0)
  const section = useRef<HTMLElement>(null)
  const nights = searched ? (Date.parse(searched.checkOutDate) - Date.parse(searched.checkInDate)) / 86400000 : 0
  const selectedRoom = grid?.items.find(room => room.roomId === roomId)
  const selectedType = types.find(type => type.id === typeId)
  function clearSelection(next: Dates) { requestVersion.current++; setDates(next); setBusy(false); setSearched(null); setTypes([]); setTypeId(''); setGrid(null); setRoomId(''); setBooking(null); setError(''); sessionStorage.removeItem(draftKey); key.current = crypto.randomUUID() }
  useEffect(() => { if (searched) section.current?.scrollIntoView({ behavior: 'smooth' }) }, [searched])
  useEffect(() => { if (!searched || !typeId) return; const controller = new AbortController(); void request<RoomGrid>('/public/rooms/grid?' + query({ ...searched, roomTypeId: typeId }), null, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setGrid(value); setRoomId(current => value.items.some(room => room.roomId === current && room.status === 'available') ? current : '') } }).catch(err => { if (!controller.signal.aborted) setError(errorText(err)) }); return () => controller.abort() }, [searched, typeId, gridRefresh])
  async function findTypes(event?: FormEvent) { event?.preventDefault(); const version = ++requestVersion.current; const count = (Date.parse(dates.checkOutDate) - Date.parse(dates.checkInDate)) / 86400000; if (!Number.isInteger(count) || count < 1 || count > 365) { setError('กรุณาเลือกวันพัก 1–365 คืน'); return } setBusy(true); setError(''); setSearched({ ...dates }); setTypeId(''); setGrid(null); setRoomId(''); try { const response = await request<RoomAvailabilitySummary>('/public/rooms/summary?' + query({ ...dates, guestCount: 1 }), null); if (version === requestVersion.current) setTypes(response.roomTypes) } catch (err) { if (version === requestVersion.current) setError(errorText(err)) } finally { if (version === requestVersion.current) setBusy(false) } }
  function selectType(id: string) { setGrid(null); setError(''); setTypeId(id); setRoomId(''); setBooking(null); sessionStorage.removeItem(draftKey); key.current = crypto.randomUUID() }
  function selectRoom(id: string) { setRoomId(id); setBooking(null); key.current = crypto.randomUUID(); if (searched) sessionStorage.setItem(draftKey, JSON.stringify({ ...searched, roomTypeId: typeId, roomId: id })) }
  useEffect(() => { if (!saved) return; const controller = new AbortController(); void request<RoomAvailabilitySummary>('/public/rooms/summary?' + query({ checkInDate: saved.checkInDate, checkOutDate: saved.checkOutDate, guestCount: 1 }), null, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setTypes(value.roomTypes) }).catch(err => { if (!controller.signal.aborted) setError(errorText(err)) }); return () => controller.abort() }, [saved])
  async function confirm(event: FormEvent) { event.preventDefault(); if (!searched || !selectedRoom || !grid || !user || user.role !== 'customer') return; setBusy(true); setError(''); try { if (!token) { setError('กรุณาเข้าสู่ระบบอีกครั้ง'); return } const result = await request<CustomerBooking>('/customer/bookings', token, { method: 'POST', idempotencyKey: key.current, body: { roomId, ...searched, phone, documentNo, expectedPricePerNight: grid.roomType.pricePerNight } }); setBooking(result); sessionStorage.removeItem(draftKey) } catch (err) { setError(errorText(err)); if ((err as { code?: string }).code === 'ROOM_UNAVAILABLE') { setRoomId(''); setGrid(null); setGridRefresh(value => value + 1) } if ((err as { code?: string }).code === 'PRICE_CHANGED') { setRoomId(''); setTypeId(''); setGrid(null) } } finally { setBusy(false) } }
  return <main className="public-hotel"><header className="hotel-header floating-navbar"><a className="home-link" href="/" aria-label="Lub d หน้าแรก"><Brand publicLogo /></a><div className="hotel-account-actions">{user ? <AccountMenu user={user} account={member} logout={logout} /> : <><button onClick={member}>สมัครสมาชิก / เข้าสู่ระบบ</button><button onClick={staff}>พนักงาน</button></>}</div></header>
    <section className="discover-section" id="discover"><div className="discover-heading"><h1>A GOOD STAY.<br />A GREAT DAY.</h1><p>เลือกวันพัก ประเภทห้อง แล้วเลือกห้องที่ใช่</p></div><div className="hotel-gallery"><img src="/figma/hotel.png" alt="โรงแรม Lub d Bangkok Siam" /><img src="/figma/pool.png" alt="พื้นที่พักผ่อน" /></div><div className="discover-search"><form className="availability-search" onSubmit={findTypes}><label className="field"><span>วันเช็กอิน</span><input type="date" required min={today()} value={dates.checkInDate} onChange={e => { const start = e.target.value; clearSelection({ checkInDate: start, checkOutDate: start >= dates.checkOutDate ? tomorrow(start) : dates.checkOutDate }) }} /></label><label className="field"><span>วันเช็กเอาต์</span><input type="date" required min={dates.checkInDate ? tomorrow(dates.checkInDate) : undefined} value={dates.checkOutDate} onChange={e => clearSelection({ ...dates, checkOutDate: e.target.value })} /></label><button className="primary" disabled={busy}>{busy ? 'กำลังค้นหา…' : 'เลือกประเภทห้อง'}</button></form></div></section>
    <section ref={section} className="public-results" aria-live="polite"><h2>เลือกประเภทห้อง</h2>{searched && <p className="stay-summary">{searched.checkInDate} – {searched.checkOutDate} · {nights} คืน</p>}{error && <div className="notice error" role="alert">{error} <button onClick={() => { if (typeId) { setError(''); setGrid(null); setGridRefresh(value => value + 1) } else void findTypes() }}>ลองอีกครั้ง</button></div>}{searched && !types.length && !error && <p role="status">กำลังโหลดประเภทห้อง…</p>}
      <div className="room-type-summary-grid">{types.map(type => <article key={type.id} className="room-type-card"><img src={roomPhoto(type.name)} alt={'ภาพประกอบ ' + type.name} /><h3>{type.name}</h3><p>สูงสุด {type.capacity} คน · ฿{money(type.pricePerNight)} / คืน</p><p>ว่าง {type.availableRooms} จาก {type.totalRooms} ห้อง</p><button type="button" aria-pressed={typeId === type.id} onClick={() => selectType(type.id)}>เลือก {type.name}</button></article>)}</div>
      {typeId && <><h2>เลือกเลขห้อง {selectedType?.name}</h2>{!grid && !error && <p role="status">กำลังโหลดห้อง…</p>}{grid && <div className="room-number-grid" role="group" aria-label="เลือกเลขห้อง">{grid.items.map(room => <button key={room.roomId} type="button" disabled={room.status !== 'available'} aria-pressed={roomId === room.roomId} className={'room-number ' + room.status} onClick={() => selectRoom(room.roomId)}>ห้อง {room.roomNumber}<small>{room.status === 'available' ? 'ว่าง' : room.status === 'maintenance' ? 'ซ่อมบำรุง' : 'ไม่ว่าง'}</small></button>)}</div>}</>}
      {selectedRoom && grid && searched && !booking && <section className="booking-confirm"><h2>ยืนยันการจอง</h2><p>{grid.roomType.name} · ห้อง {selectedRoom.roomNumber} · {searched.checkInDate} – {searched.checkOutDate}</p><p>{nights} คืน · ฿{money(grid.roomType.pricePerNight)} / คืน · รวม ฿{money(nights * grid.roomType.pricePerNight)}</p><p>จำนวนผู้พักตามความจุห้อง: {grid.roomType.capacity} คน · ชำระที่โรงแรม</p>{!user || user.role !== 'customer' ? <button className="primary" onClick={member}>เข้าสู่ระบบหรือสมัครสมาชิกเพื่อจอง</button> : <form className="form-grid" onSubmit={confirm}><p>ผู้จอง: {user.name} · {user.email}</p><label className="field"><span>เบอร์โทร</span><input required maxLength={30} value={phone} onChange={e => { setPhone(e.target.value); key.current = crypto.randomUUID() }} /></label><label className="field"><span>เลขบัตรประชาชนหรือพาสปอร์ต</span><input required minLength={5} maxLength={64} value={documentNo} onChange={e => { setDocumentNo(e.target.value); key.current = crypto.randomUUID() }} /></label><button className="primary" disabled={busy}>{busy ? 'กำลังจอง…' : 'ยืนยันจอง · ชำระที่โรงแรม'}</button></form>}</section>}
      {booking && <div className="booking-confirm" role="status"><h2>จองสำเร็จ</h2><p>เลขอ้างอิง {booking.id} · ห้อง {booking.roomNumber} · รวม ฿{money(booking.totalPrice)}</p><p>สถานะ: ยืนยันแล้ว · ชำระที่โรงแรม</p><button onClick={member}>ดูการจองของฉัน</button></div>}
    </section></main>
}
