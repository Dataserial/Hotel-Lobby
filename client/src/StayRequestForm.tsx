// ส่งคำขอเข้าพักพร้อมบริการเสริม
import { useEffect, useMemo, useRef, useState } from 'react'
import { errorText, query, request, type AdditionalService, type AvailabilityStay, type Paged, type StayRequest, type User } from './api'

// จัดรูปแบบจำนวนเงินให้อ่านง่าย
const money = (value: number) => new Intl.NumberFormat('th-TH').format(value)
const unitLabel: Record<AdditionalService['unit'], string> = { per_night: 'ต่อคืน', per_set: 'ต่อชุด', per_stay: 'ต่อการเข้าพัก' }
// กำหนดรูปแบบข้อมูล Selection ที่ส่วนนี้ใช้งาน
type Selection = Record<string, number>
const storageKey = 'lubd-stay-request-selection-v1'

// เลือกบริการและส่งคำขอเข้าพักของสมาชิก
export default function StayRequestForm({ stay, roomType, user, token, login, reauthenticate }: { stay: AvailabilityStay; roomType: { id: string; name: string; capacity: number; pricePerNight: number; supportsExtraBed?: boolean }; user?: User | null; token?: string | null; login: () => void; reauthenticate: () => void }) {
  const [services, setServices] = useState<AdditionalService[]>([]); const [selected, setSelected] = useState<Selection>(() => { try { return JSON.parse(window.localStorage?.getItem?.(storageKey) || '{}') } catch { return {} } })
  const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [needsLogin, setNeedsLogin] = useState(false); const [name, setName] = useState(user?.name || ''); const [phone, setPhone] = useState(''); const [notes, setNotes] = useState(''); const [confirming, setConfirming] = useState(false); const [submitting, setSubmitting] = useState(false); const clientRequestId = useRef<string | null>(null)
  useEffect(() => { const controller = new AbortController(); void request<Paged<AdditionalService>>('/public/additional-services?' + query({ roomTypeId: roomType.id, limit: 100 }), null, { signal: controller.signal }).then(data => { if (controller.signal.aborted) return; const permitted = data.items.filter(service => !service.extraBed || !!roomType.supportsExtraBed); setServices(permitted); setSelected(current => { const next = Object.fromEntries(Object.entries(current).filter(([id]) => permitted.some(service => service.id === id))); if (Object.keys(next).length !== Object.keys(current).length) setNotice('ลบบริการที่ใช้ไม่ได้กับประเภทห้องที่เลือกแล้ว'); return next }) }).catch(e => { if (!controller.signal.aborted) setError(errorText(e)) }); return () => controller.abort() }, [roomType.id, roomType.supportsExtraBed])
  useEffect(() => { try { window.localStorage?.setItem?.(storageKey, JSON.stringify(selected)) } catch { /* บางโหมดของเบราว์เซอร์หรือชุดทดสอบไม่ให้เก็บข้อมูล */ } }, [selected])
  const nights = Math.round((Date.parse(stay.checkOutDate) - Date.parse(stay.checkInDate)) / 86400000)
  const selectedRows = useMemo(() => services.filter(service => selected[service.id]).map(service => ({ service, quantity: selected[service.id] })), [services, selected])
  const serviceTotal = selectedRows.reduce((sum, { service, quantity }) => sum + (service.included || service.price === null ? 0 : service.price * quantity * (service.unit === 'per_night' ? nights : 1)), 0)
  const roomTotal = roomType.pricePerNight * nights
  // ปรับสถานะให้ตรงกับข้อมูลที่เปลี่ยน
  const update = (id: string, quantity: number) => setSelected(current => { const next = { ...current }; if (quantity < 1) delete next[id]; else next[id] = quantity; return next })
  // ตรวจข้อมูลและส่งคำขอของฟอร์ม
  async function submit() {
    if (!user || user.role !== 'customer') { login(); return }
    if (!token) { reauthenticate(); return }
    setSubmitting(true); setError('')
    clientRequestId.current ||= crypto.randomUUID()
    try { await request<StayRequest>('/stay-requests', token, { method: 'POST', body: { clientRequestId: clientRequestId.current, contactName: name, contactPhone: phone, checkInDate: stay.checkInDate, checkOutDate: stay.checkOutDate, guestCount: stay.guestCount, roomTypeId: roomType.id, services: selectedRows.map(row => ({ serviceId: row.service.id, quantity: row.quantity })), notes } }); setNotice('ส่งคำขอแล้ว รอการยืนยันจากพนักงาน'); setConfirming(false); setSelected({}); clientRequestId.current = null; setNeedsLogin(false); }
    catch (e) { const status = (e as { status?: number }).status; setNeedsLogin(status === 401); setError(status === 401 ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' : errorText(e)) }
    finally { setSubmitting(false) }
  }
  return <section className="stay-request-form" aria-labelledby="services-title"><h3 id="services-title">บริการเพิ่มเติมสำหรับการเข้าพัก</h3><p>เลือกได้หลายรายการ ราคาเป็นเพียงประมาณการและต้องรอพนักงานยืนยัน</p>{notice && <div className="notice" role="status">{notice}</div>}{error && <div className="notice error" role="alert">{error}<button onClick={() => needsLogin ? reauthenticate() : void submit()}>{needsLogin ? 'เข้าสู่ระบบอีกครั้ง' : 'ลองส่งอีกครั้ง'}</button></div>}
    <div className="service-list">{services.length ? services.map(service => <label key={service.id} className="service-option"><input type="checkbox" checked={!!selected[service.id]} onChange={e => update(service.id, e.target.checked ? 1 : 0)} /><span><strong>{service.name}</strong><small>{service.included ? 'รวมในราคาห้องพักแล้ว' : service.price === null ? 'ราคายังรอยืนยัน' : `฿${money(service.price)} ${unitLabel[service.unit]}`}</small></span>{selected[service.id] && service.maxQuantity > 1 && <span className="quantity"><button type="button" aria-label={'ลดจำนวน ' + service.name} onClick={() => update(service.id, selected[service.id] - 1)}>−</button><output>{selected[service.id]}</output><button type="button" aria-label={'เพิ่มจำนวน ' + service.name} disabled={selected[service.id] >= service.maxQuantity} onClick={() => update(service.id, selected[service.id] + 1)}>+</button></span>}</label>) : <p>ยังไม่มีบริการเพิ่มเติมสำหรับประเภทห้องนี้</p>}</div>
    <div className="stay-request-summary"><h4>สรุปคำขอเข้าพัก</h4><p>{roomType.name} · {stay.checkInDate} – {stay.checkOutDate} · {stay.guestCount} คน</p><p>ค่าห้องพักโดยประมาณ <strong>฿{money(roomTotal)}</strong></p><p>ค่าบริการเพิ่มเติมโดยประมาณ <strong>฿{money(serviceTotal)}</strong></p><p>ยอดประมาณการรวม <strong>฿{money(roomTotal + serviceTotal)}</strong> · ต้องรอพนักงานยืนยัน</p>{confirming ? <div className="confirm-request"><label>ชื่อผู้ติดต่อ<input required value={name} onChange={e => setName(e.target.value)} /></label><label>โทรศัพท์<input required value={phone} onChange={e => setPhone(e.target.value)} /></label><label>หมายเหตุ<textarea value={notes} onChange={e => setNotes(e.target.value)} /></label><button className="primary" disabled={submitting || !name.trim() || !phone.trim()} onClick={() => void submit()}>{submitting ? 'กำลังส่ง…' : 'ยืนยันส่งคำขอเข้าพัก'}</button><button type="button" onClick={() => setConfirming(false)}>ย้อนกลับ</button></div> : <button className="primary" onClick={() => user?.role === 'customer' ? setConfirming(true) : login()}>{user?.role === 'customer' ? 'ส่งคำขอเข้าพัก' : 'เข้าสู่ระบบเพื่อส่งคำขอ'}</button>}</div>
  </section>
}
