import { useState, type FormEvent } from 'react'
import { errorText, type RequestOptions, type User } from './api'
import { Brand } from './Brand'

export default function MemberAccount({ user, call, updated, logout, back }: { user: User; call: <T>(path: string, options?: RequestOptions) => Promise<T>; updated: (user: User) => void; logout: () => void; back: () => void }) {
  const [name, setName] = useState(user.name); const [email, setEmail] = useState(user.email)
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { const result = await call<{ user: User }>('/auth/profile', { method: 'PATCH', body: { name, email } }); updated(result.user); setNotice('บันทึกข้อมูลสมาชิกแล้ว') }
    catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  return <main className="member-page"><header><Brand /><div><button onClick={back}>ดูห้องพัก</button><button onClick={logout}>ออกจากระบบ</button></div></header><section className="panel member-card"><span className="eyebrow">บัญชีสมาชิก</span><h1>สวัสดี {user.name}</h1><p>จัดการข้อมูลบัญชีของคุณ และค้นหาห้องพักจากหน้าโรงแรม</p>{error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}<form onSubmit={save} className="form-grid"><label className="field"><span>ชื่อ–นามสกุล</span><input required maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label><label className="field"><span>อีเมล</span><input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label><div className="form-actions"><button className="primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}</button></div></form></section></main>
}
