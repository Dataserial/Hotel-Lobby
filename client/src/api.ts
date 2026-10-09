export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export type ApiError = Error & { status?: number; code?: string; requestId?: string }
export type User = { id: string; name: string; email: string; role: 'admin' | 'receptionist'; active: boolean }
export type Paged<T> = { items: T[]; page: number; limit: number; total: number }
export type Guest = { id: string; fullName: string; phone: string; email?: string; documentNoMasked?: string; active: boolean }
export type RoomType = { id: string; name: string; capacity: number; basePrice: number; amenities: string[]; active: boolean }
export type Room = { id: string; roomNumber: string; floor?: number; roomTypeId: string; status: string; active: boolean }
export type AvailableRoom = { roomId: string; roomNumber: string; roomType: string; capacity: number; pricePerNight: number }
export type Booking = { id: string; guestId: string; roomId: string; guestCount: number; checkInDate: string; checkOutDate: string; status: string; pricePerNight: number; totalPrice: number }
export type Payment = { amount: number; paidAmount: number; refundedAmount: number; net: number; remaining: number; status: string; ledgerReady: boolean }
export type Transaction = { id: string; kind: string; amount: number; method: string; reference: string; receiptId?: string; occurredAt: string }
export type Dashboard = { date: string; availableRooms: number; occupiedRooms: number; arrivalsToday: number; departuresToday: number }
export type Report = { receivedBaht: number; refundedBaht: number; netBaht: number; unreconciledPayments: number }

export function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)) })
  return params.toString()
}

export async function request<T>(path: string, token: string | null, options: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), cache: 'no-store' })
  } catch {
    throw Object.assign(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ โปรดลองอีกครั้ง'), { code: 'NETWORK_ERROR' }) as ApiError
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const error = Object.assign(new Error(data?.error?.message || `คำขอไม่สำเร็จ (${response.status})`), {
      status: response.status, code: data?.error?.code, requestId: data?.error?.requestId || response.headers.get('X-Request-Id') || undefined,
    }) as ApiError
    throw error
  }
  return data as T
}

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', UNAUTHENTICATED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
  FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์ทำรายการ', VALIDATION_ERROR: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจฟอร์ม',
  INVALID_DATE_RANGE: 'ตรวจสอบวันที่เข้าพักและออก โดยต้องพัก 1–365 คืน', INVALID_GUEST_COUNT: 'จำนวนผู้เข้าพักไม่ถูกต้อง',
  CAPACITY_EXCEEDED: 'จำนวนผู้เข้าพักเกินความจุห้อง', ROOM_UNAVAILABLE: 'ห้องนี้ถูกจองแล้ว กรุณาเลือกห้องอื่น',
  PAYMENT_REQUIRED: 'ต้องชำระยอดคงเหลือก่อนเช็กเอาต์', PAYMENT_REFUND_REQUIRED: 'ต้องคืนเงินให้ครบก่อนยกเลิก',
  PAYMENT_ADJUSTMENT_REQUIRED: 'ต้องคืนเงินก่อนแก้ไขยอดจอง', PAYMENT_RECONCILIATION_REQUIRED: 'ต้องตรวจสอบหลักฐานรับเงินเดิมก่อนดำเนินการ',
  IDEMPOTENCY_CONFLICT: 'รายการเดิมมีข้อมูลต่างกัน กรุณาตรวจสอบหลักฐาน', DUPLICATE_REFERENCE: 'เลขอ้างอิงนี้ถูกใช้แล้ว',
  RATE_LIMITED: 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่',
}
export function errorText(error: unknown) {
  const e = error as ApiError
  const detail = messages[e.code || ''] || e.message || 'เกิดข้อผิดพลาด'
  return `${detail}${e.requestId ? ` · รหัสคำขอ ${e.requestId}` : ''}`
}
