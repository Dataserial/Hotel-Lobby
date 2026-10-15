// จัดการบริการเสริมสำหรับผู้ดูแลระบบ
import { useEffect, useState, type FormEvent } from 'react'
import { errorText, query, type AdditionalService, type ApiError, type Paged, type RoomType } from './api'

// กำหนดรูปแบบข้อมูล Call ที่ส่วนนี้ใช้งาน
type Call = <T,>(path: string, options?: { method?: string; body?: unknown; signal?: AbortSignal }) => Promise<T>
const units = { per_night: 'ต่อคืน', per_set: 'ต่อชุด', per_stay: 'ต่อการเข้าพัก' }
// กำหนดค่าเริ่มต้นของฟอร์ม
const newForm = () => ({ name: '', unit: 'per_stay', price: '', included: false, extraBed: false, roomTypeIds: [] as string[], maxQuantity: 1, active: true })

// จัดการบริการเสริมและประเภทห้องที่ใช้ได้
export default function AdditionalServices({ call, setError }: { call: Call; setError: (message: string) => void }) {
  const [data, setData] = useState<Paged<AdditionalService> | null>(null)
  const [types, setTypes] = useState<RoomType[]>([])
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [active, setActive] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(newForm)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void call<Paged<AdditionalService>>('/additional-services?' + query({ page, limit: 20, q: search, active }), { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setData(result); setLoading(false) } })
      .catch(error => { if (!controller.signal.aborted && (error as ApiError).code !== 'CANCELLED') { setError(errorText(error)); setLoading(false) } })
    return () => controller.abort()
  }, [call, page, search, active, refresh, setError])
  useEffect(() => {
    const controller = new AbortController()
    // โหลดประเภทห้องที่เลือกใช้งานได้
    const loadTypes = async () => {
      const items: RoomType[] = []
      for (let page = 1; ; page++) {
        const result = await call<Paged<RoomType>>('/room-types?' + query({ page, limit: 100 }), { signal: controller.signal })
        items.push(...result.items)
        if (!result.items.length || page * result.limit >= result.total) break
      }
      if (!controller.signal.aborted) setTypes(items)
    }
    void loadTypes().catch(error => { if (!controller.signal.aborted) setError(errorText(error)) })
    return () => controller.abort()
  }, [call, setError])

  // นำข้อมูลเดิมมาแก้ไขในฟอร์ม
  function edit(service?: AdditionalService) {
    setEditing(service?.id || null); setNotice(''); setOpen(true)
    setForm(service ? { name: service.name, unit: service.unit, price: service.price === null ? '' : String(service.price), included: service.included,
      extraBed: service.extraBed, roomTypeIds: [...service.roomTypeIds], maxQuantity: service.maxQuantity, active: service.active } : newForm())
  }
  // เปลี่ยนหน้าและโหลดรายการใหม่
  function changePage(next: number) { setPage(next); setLoading(true) }
  // ตรวจและบันทึกข้อมูลจากฟอร์ม
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    const body = { name: form.name, unit: form.unit, price: form.price === '' ? null : Number(form.price), included: form.included,
      extraBed: form.extraBed, roomTypeIds: form.roomTypeIds, maxQuantity: form.maxQuantity }
    try {
      await call(editing ? '/additional-services/' + editing : '/additional-services', { method: editing ? 'PATCH' : 'POST', body: editing ? { ...body, active: form.active } : body })
      setOpen(false); setLoading(true); setRefresh(value => value + 1); setNotice('บันทึกบริการเพิ่มเติมแล้ว')
    } catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }

  return <section className="service-manager" aria-labelledby="service-settings-title">
    <div className="service-manager-head tw:flex tw:items-center tw:justify-between tw:gap-[16px] tw:flex-wrap"><div><h2 id="service-settings-title">ตั้งค่าบริการเพิ่มเติม</h2><p>เปิด/ปิดบริการ กำหนดราคาและเงื่อนไขของบริการ</p></div><button className="primary" disabled={busy} onClick={() => edit()}>＋ เพิ่มบริการ</button></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    <form className="toolbar" onSubmit={event => { event.preventDefault(); setSearch(q); changePage(1); setRefresh(value => value + 1) }}>
      <input aria-label="ค้นหาบริการเพิ่มเติม" placeholder="ค้นหาชื่อบริการ" value={q} onChange={event => setQ(event.target.value)} />
      <label className="field"><span>สถานะบริการ</span><select value={active} onChange={event => { setActive(event.target.value); changePage(1) }}><option value="">ทั้งหมด</option><option value="true">เปิดใช้งาน</option><option value="false">ปิดใช้งาน</option></select></label><button>ค้นหา</button>
    </form>
    {open && <form className="form-grid service-definition-form tw:grid tw:grid-cols-2 tw:gap-[16px]" onSubmit={save}>
      <h3 className="full">{editing ? 'แก้ไขบริการ' : 'เพิ่มบริการใหม่'}</h3>
      <label className="field"><span>ชื่อบริการ</span><input required maxLength={80} disabled={busy} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label className="field"><span>หน่วยคิดราคา</span><select disabled={busy} value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value })}>{Object.entries(units).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span>ราคาต่อหน่วย (บาท)</span><input type="number" min="0" max="2147483647" step="1" disabled={busy} value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} /><small>เว้นว่างเมื่อราคายังรอยืนยัน</small></label>
      <label className="field"><span>จำนวนสูงสุดต่อรายการ</span><input type="number" required min="1" max="20" disabled={busy} value={form.maxQuantity} onChange={event => setForm({ ...form, maxQuantity: Number(event.target.value) })} /></label>
      <label className="service-checkbox tw:flex tw:items-center tw:gap-[10px]"><input type="checkbox" disabled={busy} checked={form.included} onChange={event => setForm({ ...form, included: event.target.checked })} /> รวมในค่าห้องแล้ว</label>
      <label className="service-checkbox tw:flex tw:items-center tw:gap-[10px]"><input type="checkbox" disabled={busy} checked={form.extraBed} onChange={event => setForm({ ...form, extraBed: event.target.checked })} /> เป็นบริการเตียงเสริม</label>
      <fieldset className="full service-type-options"><legend>ประเภทห้องที่ใช้บริการได้ (ไม่เลือก = ทุกประเภท)</legend>{types.map(type => <label key={type.id} className="service-checkbox tw:flex tw:items-center tw:gap-[10px]"><input type="checkbox" disabled={busy} checked={form.roomTypeIds.includes(type.id)} onChange={event => setForm({ ...form, roomTypeIds: event.target.checked ? [...form.roomTypeIds, type.id] : form.roomTypeIds.filter(id => id !== type.id) })} /> {type.name}{!type.active && ' (ปิดใช้งาน)'}</label>)}</fieldset>
      {editing && <label className="service-checkbox full tw:flex tw:items-center tw:gap-[10px]"><input type="checkbox" disabled={busy} checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} /> เปิดใช้งานบริการ</label>}
      <div className="form-actions"><button type="button" disabled={busy} onClick={() => setOpen(false)}>ยกเลิก</button><button className="primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกบริการ'}</button></div>
    </form>}
    {loading ? <p role="status">กำลังโหลดบริการ…</p> : data?.items.length ? <div className="service-definition-list">{data.items.map(service => <article key={service.id}>
      <div><strong>{service.name}</strong><p>{service.included ? 'รวมในค่าห้องแล้ว' : service.price === null ? 'ราคายังรอยืนยัน' : `฿${service.price.toLocaleString('th-TH')}`} · {units[service.unit]} · สูงสุด {service.maxQuantity} {service.extraBed && ' · เตียงเสริม'}</p><small>{service.roomTypeIds.length ? service.roomTypeIds.map(id => types.find(type => type.id === id)?.name || id).join(' · ') : 'ทุกประเภทห้อง'}</small></div>
      <span className={'pill ' + (service.active ? 'good' : '')}>{service.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span><button disabled={busy} onClick={() => edit(service)}>แก้ไขบริการ</button>
    </article>)}</div> : <p className="empty">ยังไม่มีบริการที่ตรงกับการค้นหา เพิ่มบริการใหม่ได้จากปุ่มด้านบน</p>}
    {data && <div className="pagination"><span>ทั้งหมด {data.total} รายการ · หน้า {page}</span><div><button disabled={loading || page <= 1} onClick={() => changePage(page - 1)}>ก่อนหน้า</button><button disabled={loading || page * data.limit >= data.total} onClick={() => changePage(page + 1)}>ถัดไป</button></div></div>}
  </section>
}
