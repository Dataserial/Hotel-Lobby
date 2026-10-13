export type ContactChannel = { label: string; href: string }
export function contactChannels(env: Record<string, string | undefined>): ContactChannel[] {
  const result: ContactChannel[] = []
  const phone = env.VITE_CONTACT_PHONE?.trim()
  if (phone && /^\+?[\d ()-]{7,25}$/.test(phone) && phone.replace(/\D/g, '').length >= 7) result.push({ label: 'โทร ' + phone, href: 'tel:' + phone.replace(/[ ()-]/g, '') })
  const email = env.VITE_CONTACT_EMAIL?.trim()
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) result.push({ label: 'อีเมล ' + email, href: 'mailto:' + encodeURIComponent(email).replace('%40', '@') })
  try {
    const url = new URL(env.VITE_CONTACT_URL || '')
    if (url.protocol === 'https:' && !url.username && !url.password) result.push({ label: 'ติดต่อโรงแรมออนไลน์', href: url.href })
  } catch { /* An unset or invalid channel is not displayed as a working link. */ }
  return result
}
