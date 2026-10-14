import type { User } from './api'

export type Session = { token: string; user: User; expires: number }
export type StoredSession = Pick<Session, 'token' | 'expires'>
const sessionKey = 'hotel-lobby-session'

export function clearStoredSession() {
  try { sessionStorage.removeItem(sessionKey) } catch { /* Storage can be unavailable. */ }
}

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

export function storeSession(session: Session) {
  try {
    sessionStorage.setItem(sessionKey, JSON.stringify({ token: session.token, expires: session.expires }))
  } catch { /* The current login remains usable when storage is unavailable. */ }
}
