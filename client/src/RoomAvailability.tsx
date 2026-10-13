import { useEffect, useState } from 'react'
import { errorText, query, request, type AvailabilityStay, type RoomAvailabilitySearch, type RoomAvailabilitySummary } from './api'
import { roomPhoto } from './roomPhotos'
import './RoomAvailability.css'

const money = (value: number) => new Intl.NumberFormat('th-TH').format(value)
const dateLabel = (value: string) => new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'))
const shortDate = (value: string) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'))

export default function RoomAvailability({ stay, roomTypeId, selectRoomType, choose }: { stay: AvailabilityStay; roomTypeId: string; selectRoomType: (id: string) => void; choose: (stay: RoomAvailabilitySearch) => void }) {
  const [result, setResult] = useState<{ key: string; data?: RoomAvailabilitySummary; error?: string } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [calendarPage, setCalendarPage] = useState(0)
  const parameters = query({ checkInDate: stay.checkInDate, checkOutDate: stay.checkOutDate, guestCount: stay.guestCount })
  const key = parameters + ':' + refresh
  useEffect(() => {
    const controller = new AbortController()
    void request<RoomAvailabilitySummary>('/public/rooms/summary?' + parameters, null, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ key, data })
    }).catch(error => { if (!controller.signal.aborted) setResult({ key, error: errorText(error) }) })
    return () => controller.abort()
  }, [parameters, key])
  const data = result?.key === key ? result.data : undefined
  const selectedType = data?.roomTypes.find(type => type.id === roomTypeId) || data?.roomTypes[0]
  useEffect(() => {
    if (selectedType && selectedType.id !== roomTypeId) selectRoomType(selectedType.id)
  }, [selectedType, roomTypeId, selectRoomType])
  const error = result?.key === key ? result.error : undefined
  const availableRooms = selectedType?.availableRooms || 0
  const busy = !data && !error
  const page = Math.min(calendarPage, Math.max(0, Math.ceil((data?.previewDays || 1) / 7) - 1))
  return <section className="availability-panel" aria-labelledby="availability-title" aria-busy={busy}>
    <div className="availability-panel-head"><div><span className="eyebrow">YOUR ROOM, YOUR DATES</span><h2 id="availability-title">ห้องไหนว่างสำหรับคุณ?</h2><p>{dateLabel(stay.checkInDate)} – {dateLabel(stay.checkOutDate)} · {stay.guestCount} คนต่อห้อง</p></div><button disabled={busy} onClick={() => setRefresh(value => value + 1)}>{busy ? 'กำลังตรวจสอบ…' : 'อัปเดตห้องว่าง'}</button></div>
    {busy && <p className="availability-feedback" role="status">กำลังตรวจสอบประเภทห้องและวันว่างจากระบบ…</p>}
    {error && <div className="notice error" role="alert">{error} ยังไม่สามารถยืนยันจำนวนห้องว่างได้<button onClick={() => setRefresh(value => value + 1)}>ลองโหลดอีกครั้ง</button></div>}
    {data && <>
      <div className={'availability-banner ' + (!availableRooms ? 'availability-banner-empty' : '')} role="status"><span className="availability-banner-icon" aria-hidden="true">☾</span><div><strong>{availableRooms ? `${selectedType?.name} · พบ ${availableRooms} ห้องที่พักได้ครบ ${data.nights} คืน` : `ยังไม่มีห้อง${selectedType ? ' ' + selectedType.name + ' ' : ''}ที่รองรับ ${data.guestCount} คน ว่างครบ ${data.nights} คืนในช่วงนี้`}</strong><p>{availableRooms ? 'เลือกดูประเภทห้องด้านล่าง หรือกดวันอื่นเพื่อเปรียบเทียบห้องว่าง' : 'ดูวันที่แนะนำด้านล่าง หรือเปลี่ยนจำนวนผู้เข้าพักแล้วค้นหาใหม่'}</p></div></div>
      {data.roomTypes.length ? <>
        <div className="room-type-browser">
        <div className="room-type-selector" role="group" aria-label="เลือกประเภทห้องพัก">{data.roomTypes.map(type => <button key={type.id} type="button" aria-pressed={type.id === selectedType?.id} aria-controls="selected-room-type" onClick={() => selectRoomType(type.id)}>{type.name}</button>)}</div>
        <div className="room-type-summary-grid" id="selected-room-type" aria-live="polite">{(selectedType ? [selectedType] : []).map(type => {
          const fits = data.guestCount <= type.capacity
          const next = type.dates.find(date => date.availableRooms > 0)
          return <article key={type.id} className="room-type-card" data-room-type={type.name}>
            <div className="room-type-photo"><img src={roomPhoto(type.name)} alt={'ภาพประกอบห้องพัก ' + type.name} loading="lazy" decoding="async" /><small>ภาพประกอบ</small><span className={'room-count-badge ' + (!type.availableRooms ? 'sold-out' : '')}>{type.availableRooms ? `เหลือ ${type.availableRooms} ห้อง` : fits ? 'ไม่ว่างในช่วงที่เลือก' : 'จำนวนคนเกินความจุ'}</span></div>
            <div className="room-type-content"><h3>{type.name}</h3><div className="room-type-facts"><span>สูงสุด {type.capacity} คนต่อห้อง</span><span>{type.totalRooms} ห้องในระบบ</span></div>
              <div className="room-type-price"><strong>฿{money(type.pricePerNight)}</strong><span> / ห้อง / คืน</span><small>รวม {data.nights} คืน ฿{money(type.pricePerNight * data.nights)}</small></div>
              {type.availableRooms > 0 ? <p className="room-availability-copy">ว่างครบทุกคืนของช่วงที่เลือก · ความจุรวมสูงสุด {type.availableRooms * type.capacity} คนเมื่อแบ่งพัก {type.availableRooms} ห้อง</p> : <p className="room-availability-copy">{!fits ? `ประเภทนี้รับได้ ${type.capacity} คนต่อห้อง กรุณาลดจำนวนคนหรือเลือกประเภทที่ใหญ่กว่า` : next ? `ช่วงถัดไปที่พบห้องว่าง: ${dateLabel(next.checkInDate)} – ${dateLabel(next.checkOutDate)}` : `ยังไม่พบห้องว่างสำหรับ ${data.nights} คืน ในวันเริ่มพัก ${data.previewDays} วันที่ตรวจสอบ`}</p>}
              {type.amenities.length > 0 && <p className="room-type-amenities">{type.amenities.join(' · ')}</p>}
              <div className="room-calendar"><h4>วันเริ่มพักทางเลือก · พัก {data.nights} คืน</h4><div className="date-chip-grid">{type.dates.slice(page * 7, page * 7 + 7).map(date => <button key={date.checkInDate} className={'date-chip ' + (date.checkInDate === data.checkInDate ? 'selected-date' : '')} disabled={!date.availableRooms} aria-label={`ค้นหาห้อง ${type.name} ${dateLabel(date.checkInDate)} ถึง ${dateLabel(date.checkOutDate)} ว่าง ${date.availableRooms} ห้อง`} onClick={() => choose({ checkInDate: date.checkInDate, checkOutDate: date.checkOutDate, guestCount: data.guestCount, roomTypeId: type.id })}><span>{shortDate(date.checkInDate)}</span><strong>{date.availableRooms ? `${date.availableRooms} ห้อง` : 'ไม่ว่าง'}</strong></button>)}</div></div>
              <button className="primary" disabled={!type.availableRooms} onClick={() => choose({ checkInDate: data.checkInDate, checkOutDate: data.checkOutDate, guestCount: data.guestCount, roomTypeId: type.id })}>ดูห้องว่างช่วงที่เลือก</button>
            </div>
          </article>
        })}</div></div>
        {data.previewDays > 7 && <div className="availability-calendar-pager"><span>แสดงวันเริ่มพัก {page * 7 + 1}–{Math.min(page * 7 + 7, data.previewDays)} จาก {data.previewDays} วัน</span><div><button disabled={!page} onClick={() => setCalendarPage(0)}>7 วันแรก</button><button disabled={page === 1} onClick={() => setCalendarPage(1)}>7 วันถัดไป</button></div></div>}
      </> : <div className="public-empty"><h3>ยังไม่มีประเภทห้องที่เปิดใช้งานในระบบ</h3><p>กรุณาติดต่อโรงแรมเพื่อสอบถามห้องพัก ไม่มีการแสดงจำนวนห้องสมมติ</p></div>}
      <p className="availability-footnote">ตรวจ ณ {new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(data.updatedAt))} น. · ทุกจำนวนตรวจว่าห้องเดิมว่างครบ {data.nights} คืน · วันออกไม่นับเป็นคืนพัก · ดูข้อมูลต่อได้โดยเปลี่ยนวันค้นหา</p><p className="availability-footnote">รูปที่ให้มาใช้เป็นภาพประกอบประเภทห้อง รายละเอียดห้องจริงและการพักหลายห้องต้องยืนยันกับพนักงาน จำนวนห้องอาจเปลี่ยนก่อนยืนยันการจอง</p>
    </>}
  </section>
}
