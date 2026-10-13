export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export type ApiError = Error & { status?: number; code?: string; requestId?: string }
export type User = { id: string; name: string; email: string; role: 'admin' | 'receptionist' | 'customer'; active: boolean }
export type Paged<T> = { items: T[]; page: number; limit: number; total: number }
export type Guest = { id: string; fullName: string; phone: string; email?: string; documentNoMasked?: string; active: boolean }
export type RoomType = { id: string; name: string; capacity: number; basePrice: number; amenities: string[]; active: boolean }
export type Room = { id: string; roomNumber: string; floor?: number; roomTypeId: string; status: string; active: boolean }
export type AvailableRoom = { roomId: string; roomNumber: string; roomType: string; capacity: number; pricePerNight: number }
export type PublicOverview = { date: string; checkOutDate: string; timezone: string; updatedAt: string; totalRooms: number; availableRooms: number; bookedRooms: number; roomTypes: { id: string; name: string; capacity: number; pricePerNight: number; amenities: string[]; totalRooms: number; availableRooms: number }[] }
export type AvailabilityStay = { checkInDate: string; checkOutDate: string; guestCount: number }
export type RoomAvailabilitySearch = AvailabilityStay & { roomTypeId?: string }
export type RoomAvailabilitySummary = AvailabilityStay & { nights: number; previewDays: number; timezone: string; updatedAt: string; totalAvailableRooms: number; roomTypes: (PublicOverview['roomTypes'][number] & { dates: { checkInDate: string; checkOutDate: string; availableRooms: number }[] })[] }
export type RoomGrid = { roomType: { id: string; name: string; capacity: number; pricePerNight: number; amenities: string[] }; items: { roomId: string; roomNumber: string; status: 'available' | 'unavailable' | 'maintenance' }[] }
export type BookingRoomType = RoomGrid['roomType'] & { totalRooms: number; availableRooms: number }
export type CustomerBooking = { id: string; roomNumber: string; roomType: string; checkInDate: string; checkOutDate: string; guestCount: number; pricePerNight: number; totalPrice: number; status: string; paymentStatus: string }
export type Booking = { id: string; guestId: string; roomId: string; guestCount: number; checkInDate: string; checkOutDate: string; status: string; pricePerNight: number; totalPrice: number }
export type Payment = { amount: number; paidAmount: number; refundedAmount: number; net: number; remaining: number; status: string; ledgerReady: boolean }
export type Transaction = { id: string; kind: string; amount: number; method: string; reference: string; receiptId?: string; occurredAt: string }
export type Dashboard = { date: string; availableRooms: number; occupiedRooms: number; arrivalsToday: number; departuresToday: number }
export type Report = { receivedBaht: number; refundedBaht: number; netBaht: number; unreconciledPayments: number }
export type AdditionalService = { id: string; name: string; unit: 'per_night' | 'per_set' | 'per_stay'; price: number | null; included: boolean; extraBed: boolean; roomTypeIds: string[]; maxQuantity: number; active: boolean }
export type StayRequest = { id: string; status: 'new' | 'read' | 'processed' | 'rejected'; createdAt?: string; contactPhone?: string; member?: { name: string }; roomTypeName: string; checkInDate: string; checkOutDate: string; guestCount: number; estimatedRoomTotal: number; estimatedServiceTotal: number; services: { id: string; name: string; quantity: number; unit: string; price: number | null; included: boolean; estimatedTotal: number }[] }

export function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)) })
  return params.toString()
}

export type RequestOptions = { method?: string; body?: unknown; idempotencyKey?: string; signal?: AbortSignal; timeoutMs?: number }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const strings = (v: Record<string, unknown>, ...keys: string[]) => keys.every(key => typeof v[key] === 'string')
const numbers = (v: Record<string, unknown>, ...keys: string[]) => keys.every(key => typeof v[key] === 'number' && Number.isSafeInteger(v[key]))
function calendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function validRoomSummary(data: Record<string, unknown>): boolean {
  if (!calendarDate(data.checkInDate) || !calendarDate(data.checkOutDate) || !strings(data, 'updatedAt') || !Number.isFinite(Date.parse(String(data.updatedAt))) || data.timezone !== 'Asia/Bangkok' || !numbers(data, 'guestCount', 'nights', 'previewDays', 'totalAvailableRooms')) return false
  if (Number(data.guestCount) < 1 || Number(data.guestCount) > 20 || Number(data.nights) < 1 || Number(data.nights) > 365 || Number(data.previewDays) < 1 || Number(data.previewDays) > 14 || Number(data.totalAvailableRooms) < 0) return false
  const duration = (start: unknown, end: unknown) => (Date.parse(String(end) + 'T00:00:00Z') - Date.parse(String(start) + 'T00:00:00Z')) / 86400000
  if (duration(data.checkInDate, data.checkOutDate) !== data.nights || !Array.isArray(data.roomTypes)) return false
  return data.roomTypes.every(type => record(type) && strings(type, 'id', 'name') && numbers(type, 'capacity', 'pricePerNight', 'totalRooms', 'availableRooms') && Number(type.capacity) >= 1 && Number(type.capacity) <= 20 && Number(type.pricePerNight) >= 0 && Number(type.totalRooms) >= 1 && Number(type.availableRooms) >= 0 && Number(type.availableRooms) <= Number(type.totalRooms) && Array.isArray(type.amenities) && type.amenities.every(amenity => typeof amenity === 'string') && Array.isArray(type.dates) && type.dates.length === data.previewDays && type.dates.every(date => record(date) && calendarDate(date.checkInDate) && calendarDate(date.checkOutDate) && duration(date.checkInDate, date.checkOutDate) === data.nights && numbers(date, 'availableRooms') && Number(date.availableRooms) >= 0 && Number(date.availableRooms) <= Number(type.totalRooms)))
}
function validItem(resource: string, item: unknown): boolean {
  if (!record(item)) return false
  if (resource.includes('availability')) return strings(item, 'roomId', 'roomNumber', 'roomType') && numbers(item, 'capacity', 'pricePerNight')
  if (!strings(item, 'id')) return false
  if (resource.includes('transactions') || /\/(receipts|refunds)$/.test(resource)) return strings(item, 'kind', 'method', 'reference', 'occurredAt') && numbers(item, 'amount')
  if (resource.startsWith('/guests')) return strings(item, 'fullName', 'phone') && ['email', 'documentNoMasked'].every(key => item[key] == null || typeof item[key] === 'string')
  if (resource.startsWith('/room-types')) return strings(item, 'name') && numbers(item, 'capacity', 'basePrice') && Array.isArray(item.amenities) && item.amenities.every(a => typeof a === 'string')
  if (resource.startsWith('/rooms')) return strings(item, 'roomNumber') && ['roomTypeId', 'status'].every(key => item[key] == null || typeof item[key] === 'string') && (item.floor == null || numbers(item, 'floor')) && (item.active == null || typeof item.active === 'boolean')
  if (resource.startsWith('/users')) return strings(item, 'name', 'email', 'role') && ['admin', 'receptionist', 'customer'].includes(String(item.role)) && typeof item.active === 'boolean'
  if (resource.startsWith('/bookings')) return strings(item, 'guestId', 'roomId', 'checkInDate', 'checkOutDate', 'status') && numbers(item, 'guestCount', 'pricePerNight', 'totalPrice')
  return true
}
function validPayload(path: string, data: unknown, method: string): boolean {
  if (!record(data)) return false
  const resource = path.split('?')[0]
  if (resource === '/public/rooms/grid/types') return Array.isArray(data.items) && data.items.every(item => record(item) && strings(item, 'id', 'name') && numbers(item, 'capacity', 'pricePerNight', 'totalRooms', 'availableRooms') && Number(item.capacity) > 0 && Number(item.pricePerNight) >= 0 && Number(item.availableRooms) >= 0 && Number(item.availableRooms) <= Number(item.totalRooms) && Array.isArray(item.amenities) && item.amenities.every(value => typeof value === 'string'))
  if (resource === '/public/rooms/grid') return record(data.roomType) && strings(data.roomType, 'id', 'name') && numbers(data.roomType, 'capacity', 'pricePerNight') && Number(data.roomType.capacity) >= 1 && Number(data.roomType.capacity) <= 20 && Number(data.roomType.pricePerNight) >= 0 && Array.isArray(data.roomType.amenities) && data.roomType.amenities.every(value => typeof value === 'string') && Array.isArray(data.items) && data.items.every(item => record(item) && strings(item, 'roomId', 'roomNumber', 'status') && ['available', 'unavailable', 'maintenance'].includes(String(item.status)))
  if (resource === '/customer/bookings') {
    const validBooking = (item: unknown) => record(item) && strings(item, 'id', 'roomNumber', 'roomType', 'checkInDate', 'checkOutDate', 'status', 'paymentStatus') && numbers(item, 'guestCount', 'pricePerNight', 'totalPrice')
    return method === 'GET' ? numbers(data, 'page', 'limit', 'total') && Number(data.page) >= 1 && Number(data.limit) >= 1 && Number(data.total) >= 0 && Array.isArray(data.items) && data.items.length <= Number(data.limit) && data.items.every(validBooking) : validBooking(data)
  }
  if (resource === '/public/rooms/summary') return validRoomSummary(data)
  if (resource === '/public/overview') return calendarDate(data.date) && calendarDate(data.checkOutDate) && strings(data, 'timezone', 'updatedAt') && Number.isFinite(Date.parse(String(data.updatedAt))) && numbers(data, 'totalRooms', 'availableRooms', 'bookedRooms') && ['totalRooms', 'availableRooms', 'bookedRooms'].every(key => Number(data[key]) >= 0) && Array.isArray(data.roomTypes) && data.roomTypes.every(type => record(type) && strings(type, 'id', 'name') && numbers(type, 'capacity', 'pricePerNight', 'totalRooms', 'availableRooms') && Number(type.capacity) > 0 && Number(type.pricePerNight) >= 0 && Number(type.totalRooms) >= 0 && Number(type.availableRooms) >= 0 && Array.isArray(type.amenities) && type.amenities.every(amenity => typeof amenity === 'string'))
  if (resource === '/public/additional-services') return Array.isArray(data.items) && numbers(data, 'page', 'limit', 'total') && data.items.every(item => validItem('/additional-services', item))
  if (resource === '/additional-services' && method === 'GET') return Array.isArray(data.items) && numbers(data, 'page', 'limit', 'total') && data.items.every(item => validItem('/additional-services', item))
  if (resource === '/stay-requests' && method === 'GET') return Array.isArray(data.items) && numbers(data, 'page', 'limit', 'total')
  if (resource === '/auth/login') return strings(data, 'token') && numbers(data, 'expiresIn') && Number(data.expiresIn) > 0 && validItem('/users', data.user)
  if (['/auth/me', '/auth/register', '/auth/profile'].includes(resource)) return validItem('/users', data.user)
  if (resource === '/dashboard/report') return numbers(data, 'receivedBaht', 'refundedBaht', 'netBaht', 'unreconciledPayments')
  if (resource === '/dashboard') return strings(data, 'date') && numbers(data, 'availableRooms', 'occupiedRooms', 'arrivalsToday', 'departuresToday')
  if (/\/payment$/.test(resource)) return numbers(data, 'amount', 'paidAmount', 'refundedAmount', 'net', 'remaining') && strings(data, 'status') && typeof data.ledgerReady === 'boolean'
  if (method === 'GET' && (/^\/(guests|rooms|room-types|users|bookings)$/.test(resource) || ['/rooms/availability', '/public/rooms/availability'].includes(resource) || /^\/bookings\/[^/]+\/payment\/transactions$/.test(resource))) return Array.isArray(data.items) && numbers(data, 'page', 'limit', 'total') && Number(data.page) >= 1 && Number(data.limit) >= 1 && Number(data.total) >= 0 && data.items.every(item => validItem(resource, item))
  if ('items' in data) return false
  return validItem(resource, data)
}

export async function request<T>(path: string, token: string | null, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  options.signal?.addEventListener('abort', cancel, { once: true })
  if (options.signal?.aborted) cancel()
  const timeout = Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
  let response: Response | undefined
  try {
    response = await fetch(`${API_BASE}${path}`, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), cache: 'no-store', signal: controller.signal })
    if (response.status === 204 && (options.method === 'DELETE' || (path === '/auth/logout' && options.method === 'POST'))) return null as T
    const isJson = /^(application\/json|application\/[\w.+-]+\+json)(;|$)/i.test(response.headers.get('Content-Type') || '')
    const data = isJson ? await response.json().catch(() => null) : null
    const requestId = response.headers.get('X-Request-Id') || undefined
    if (!response.ok) {
      const detail = record(data) && record(data.error) ? data.error : {}
      throw Object.assign(new Error(typeof detail.message === 'string' ? detail.message : `คำขอไม่สำเร็จ (${response.status})`), { status: response.status, code: detail.code, requestId: detail.requestId || requestId }) as ApiError
    }
    if (!isJson || !validPayload(path, data, options.method || 'GET')) throw Object.assign(new Error('เซิร์ฟเวอร์ตอบข้อมูลผิดรูปแบบ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแล'), { code: 'PROTOCOL_ERROR', requestId }) as ApiError
    return data as T
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error(timedOut ? 'เซิร์ฟเวอร์ตอบช้าเกินกำหนด หากเป็นรายการเงินอาจบันทึกแล้ว ให้ส่งซ้ำด้วยข้อมูลเดิม' : 'ยกเลิกคำขอแล้ว'), { code: timedOut ? 'TIMEOUT' : 'CANCELLED' }) as ApiError
    }
    if ((error as ApiError).code || (error as ApiError).status) throw error
    throw Object.assign(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ โปรดลองอีกครั้ง'), { code: 'NETWORK_ERROR' }) as ApiError
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', cancel)
  }
}

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', UNAUTHENTICATED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
  FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์ทำรายการ', VALIDATION_ERROR: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจฟอร์ม',
  INVALID_DATE_RANGE: 'ตรวจสอบวันที่เข้าพักและออก โดยต้องพัก 1–365 คืน', INVALID_GUEST_COUNT: 'จำนวนผู้เข้าพักไม่ถูกต้อง',
  CAPACITY_EXCEEDED: 'จำนวนผู้เข้าพักเกินความจุห้อง', ROOM_UNAVAILABLE: 'ห้องนี้ถูกจองแล้ว กรุณาเลือกห้องอื่น',
  PAYMENT_REQUIRED: 'ต้องชำระยอดคงเหลือก่อนเช็กเอาต์', PAYMENT_REFUND_REQUIRED: 'ต้องคืนเงินให้ครบก่อนยกเลิก',
  PAYMENT_ADJUSTMENT_REQUIRED: 'ต้องคืนเงินก่อนแก้ไขยอดจอง', PAYMENT_RECONCILIATION_REQUIRED: 'ต้องตรวจสอบหลักฐานรับเงินเดิมก่อนดำเนินการ',
  PRICE_CHANGED: 'ราคาห้องเปลี่ยนแล้ว กรุณาตรวจราคาใหม่ก่อนยืนยัน', DOCUMENT_REVIEW_REQUIRED: 'เลขเอกสารนี้มีในระบบแล้ว กรุณาติดต่อพนักงานเพื่อตรวจสอบ',
  IDEMPOTENCY_CONFLICT: 'รายการเดิมมีข้อมูลต่างกัน กรุณาตรวจสอบหลักฐาน', DUPLICATE_REFERENCE: 'เลขอ้างอิงนี้ถูกใช้แล้ว',
  RATE_LIMITED: 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่',
  PASSWORD_POLICY: 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร และไม่เกิน 72 ไบต์ UTF-8 (ภาษาไทยใช้หลายไบต์ต่อตัว)',
}
export function errorText(error: unknown) {
  const e = error as ApiError
  if (e.code === 'INVALID_CREDENTIALS') return messages.INVALID_CREDENTIALS
  const detail = messages[e.code || ''] || e.message || 'เกิดข้อผิดพลาด'
  return `${detail}${e.requestId ? ` · รหัสคำขอ ${e.requestId}` : ''}`
}
