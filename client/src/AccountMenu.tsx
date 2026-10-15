// เมนูบัญชีผู้ใช้และการออกจากระบบ
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { User } from './api'

// แสดงเมนูบัญชีและปิดเมนูเมื่อคลิกภายนอก
export default function AccountMenu({ user, account, logout }: { user: User; account?: () => void; logout?: () => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const focusLast = useRef(false)
  const menuId = useId()
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase() || '?'
  const accountLabel = user.role === 'customer' ? 'บัญชีสมาชิก' : 'ระบบพนักงาน'
  useEffect(() => {
    if (!open) return
    const items = panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    if (items?.length) items[focusLast.current ? items.length - 1 : 0].focus()
    // ปิดเมนูเมื่อคลิกนอกพื้นที่
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  // ปิดเมนูหรือหน้าต่างที่เปิดอยู่
  function close() { setOpen(false); trigger.current?.focus() }
  // รับคำสั่งแป้นพิมพ์ของเมนู
  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || [])
    const index = items.findIndex(item => item === document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
  return <div ref={root} className="account-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    <button ref={trigger} className="account-trigger" data-account-trigger aria-label={'เมนูบัญชี ' + user.name} title={user.name} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => { focusLast.current = false; setOpen(value => !value) }} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); focusLast.current = event.key === 'ArrowUp'; setOpen(true) }
    }}>{initials}</button>
    {open && <div ref={panel} className="account-dropdown" id={menuId} role="menu" aria-label="ตัวเลือกบัญชี" onKeyDown={keys}>
      <div className="account-details" role="presentation"><strong>{user.name}</strong><small>{user.email}</small><span>เข้าสู่ระบบแล้ว</span></div>
      <button role="menuitem" tabIndex={-1} onClick={() => { close(); account?.() }}>{accountLabel}</button>
      <button className="account-logout" role="menuitem" tabIndex={-1} onClick={() => { close(); logout?.() }}>ออกจากระบบ</button>
    </div>}
  </div>
}
