// เก็บและอ่านสถานะเข้าสู่ระบบในแท็บปัจจุบัน
import type { User } from './api'

// กำหนดรูปแบบข้อมูล Session ที่ส่วนนี้ใช้งาน
export type Session = { token: string; user: User; expires: number }
// กำหนดรูปแบบข้อมูล StoredSession ที่ส่วนนี้ใช้งาน
export type StoredSession = Pick<Session, 'token' | 'expires'>
const sessionKey = 'hotel-lobby-session'

// ลบ session ที่เก็บในแท็บ
export function clearStoredSession() {
  try { sessionStorage.removeItem(sessionKey) } catch { /* บางเบราว์เซอร์อาจไม่อนุญาตให้เก็บข้อมูล */ }
}

// อ่าน session และทิ้งข้อมูลที่หมดอายุหรือผิดรูปแบบ
export function readStoredSession(): StoredSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(sessionKey) || 'null')
    if (!value) return null
    if (typeof value.token !== 'string' || !value.token.trim() || value.token.length > 128
      || !Number.isFinite(value.expires) || value.expires <= Date.now()) {
      clearStoredSession()
      return null
    }
    return { token: value.token, expires: value.expires }
  } catch {
    clearStoredSession()
    return null
  }
}

// เก็บ token และวันหมดอายุในแท็บปัจจุบัน
export function storeSession(session: Session) {
  try {
    sessionStorage.setItem(sessionKey, JSON.stringify({ token: session.token, expires: session.expires }))
  } catch { /* ยังเข้าสู่ระบบต่อได้แม้เก็บ session ในเบราว์เซอร์ไม่ได้ */ }
}
