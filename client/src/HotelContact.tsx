import { contactChannels } from './contact'

export default function HotelContact() {
  const channels = contactChannels(import.meta.env)
  return <div className="hotel-contact" aria-label="ติดต่อโรงแรม">
    <strong>ติดต่อโรงแรม</strong>
    {channels.length ? <div className="contact-links tw:grid tw:gap-[12px] tw:m-[20px_0]">{channels.map(channel => <a key={channel.href} href={channel.href} target={channel.href.startsWith('https:') ? '_blank' : undefined} rel={channel.href.startsWith('https:') ? 'noopener noreferrer' : undefined}>{channel.label}</a>)}</div>
      : <p>ช่องทางติดต่อออนไลน์ยังไม่พร้อม กรุณาติดต่อเคาน์เตอร์โรงแรมเพื่อแก้ไขหรือยกเลิกการจอง</p>}
  </div>
}
