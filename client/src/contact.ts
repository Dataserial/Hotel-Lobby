// ตรวจสอบช่องทางติดต่อที่ตั้งค่าไว้
// กำหนดรูปแบบข้อมูล ContactChannel ที่ส่วนนี้ใช้งาน
export type ContactChannel = { label: string; href: string }
// เลือกเฉพาะช่องทางติดต่อที่ใช้ได้
export function contactChannels(env: Record<string, string | undefined>): ContactChannel[] {
  const result: ContactChannel[] = []
  const phone = env.VITE_CONTACT_PHONE?.trim()
  if (phone && /^\+?[\d ()-]{7,25}$/.test(phone) && phone.replace(/\D/g, '').length >= 7) result.push({ label: 'โทร ' + phone, href: 'tel:' + phone.replace(/[ ()-]/g, '') })
  const email = env.VITE_CONTACT_EMAIL?.trim()
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) result.push({ label: 'อีเมล ' + email, href: 'mailto:' + encodeURIComponent(email).replace('%40', '@') })
  try {
    const url = new URL(env.VITE_CONTACT_URL || '')
    if (url.protocol === 'https:' && !url.username && !url.password) result.push({ label: 'ติดต่อโรงแรมออนไลน์', href: url.href })
  } catch { /* ไม่แสดงลิงก์ที่ยังไม่ตั้งค่าหรือรูปแบบไม่ถูกต้อง */ }
  return result
}
