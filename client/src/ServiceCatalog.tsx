import { useEffect, useState } from 'react'
import { errorText, query, request, type AdditionalService, type Paged } from './api'

const units = { per_night: 'ต่อคืน', per_set: 'ต่อชุด', per_stay: 'ต่อการเข้าพัก' }
export default function ServiceCatalog({ roomTypeId, supportsExtraBed }: { roomTypeId: string; supportsExtraBed: boolean }) {
  const [open, setOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<{ key: string; items?: AdditionalService[]; error?: string } | null>(null)
  const key = roomTypeId + ':' + refresh
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const load = async () => {
      const items: AdditionalService[] = []
      for (let page = 1; ; page++) {
        const response = await request<Paged<AdditionalService>>('/public/additional-services?' + query({ roomTypeId, page, limit: 100 }), null, { signal: controller.signal })
        items.push(...response.items)
        if (!response.items.length || page * response.limit >= response.total) break
      }
      if (!controller.signal.aborted) setResult({ key, items })
    }
    void load().catch(error => { if (!controller.signal.aborted) setResult({ key, error: errorText(error) }) })
    return () => controller.abort()
  }, [open, roomTypeId, key])
  const current = result?.key === key ? result : null
  const services = current?.items?.filter(service => !service.extraBed || supportsExtraBed)
  return <details className="service-catalog" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>ดูบริการของโรงแรม</summary>
    {open && <><p>ค่าบริการเพิ่มเติมยังไม่รวมในยอดจองห้องพัก กรุณาติดต่อพนักงานเพื่อยืนยันบริการ</p>
      {current?.error ? <div className="notice error" role="alert">{current.error}<button type="button" onClick={() => setRefresh(value => value + 1)}>ลองโหลดบริการอีกครั้ง</button></div>
        : !services ? <p role="status">กำลังโหลดบริการ…</p> : services.length ? <ul>{services.map(service => <li key={service.id}><strong>{service.name}</strong><span>{service.included ? 'รวมในค่าห้องแล้ว' : service.price === null ? 'ราคายังรอยืนยัน' : `฿${service.price.toLocaleString('th-TH')} ${units[service.unit]}`}</span></li>)}</ul> : <p>ยังไม่มีบริการเพิ่มเติมที่เปิดใช้สำหรับประเภทห้องนี้</p>}
    </>}
  </details>
}
