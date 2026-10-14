import { useEffect, useRef, useState } from 'react'
import { Brand } from './Brand'
import { errorText, request, type PublicOverview, type User } from './api'
import { setupReveal } from './reveal'
import AccountMenu from './AccountMenu'
import MoonIntro from './MoonIntro'
import { scrollToTarget } from './navigation'
import './HomePage.css'

const money = (value: number) => new Intl.NumberFormat('th-TH').format(value)
const dateLabel = (value: string) => new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'))

export default function HomePage({ user, hotel, member, register, staff, logout }: { user: User | null; hotel: () => void; member: () => void; register: () => void; staff: () => void; logout: () => void }) {
  const root = useRef<HTMLElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [overview, setOverview] = useState<PublicOverview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (root.current) return setupReveal(root.current)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void request<PublicOverview>('/public/overview', null, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setOverview(data); setError('') }
    }).catch(error => { if (!controller.signal.aborted) setError(errorText(error)) }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [refresh])
  const reload = () => { setBusy(true); setRefresh(value => value + 1) }
  const minimum = overview?.roomTypes.length ? Math.min(...overview.roomTypes.map(type => type.pricePerNight)) : null
  return <main id="home" ref={root} className="home-page"><MoonIntro begin={() => scrollToTarget(content.current)} /><div ref={content}>
    <header className="home-header floating-navbar">
      <a className="home-link" href="#home" aria-label="Lub d หน้าแรก"><Brand publicLogo /></a>
      <nav aria-label="เมนูหน้าแรก"><a href="#home-rooms">ห้องพักและราคา</a><a href="#home-guide">วิธีใช้งาน</a><button onClick={hotel}>ค้นหาห้องพัก</button></nav>
      <div className="home-account tw:flex tw:gap-[10px] tw:items-center tw:flex-wrap">{user ? <AccountMenu user={user} account={user.role === 'customer' ? member : staff} logout={logout} /> : <><button onClick={member}>เข้าสู่ระบบ</button><button className="primary" onClick={register}>สมัครสมาชิก</button></>}</div>
    </header>
    <section className="home-hero">
      <div className="home-hero-copy"><span className="eyebrow">LUB D · BANGKOK SIAM</span><h1>เริ่มต้นวันดี ๆ<br />ด้วยห้องพักที่ใช่<span className="home-moon" aria-hidden="true">☾</span></h1><p>ค้นหาห้องว่าง เปรียบเทียบราคา และเตรียมการเข้าพักของคุณในที่เดียว ตั้งแต่เลือกวันพัก เลือกเลขห้อง ไปจนถึงยืนยันการจองและชำระที่โรงแรม</p><div className="home-hero-actions tw:flex tw:flex-wrap tw:gap-[24px] tw:items-center tw:mt-[30px]"><button className="primary" onClick={hotel}>ค้นหาห้องพัก</button><a href="#home-guide">ดูวิธีใช้งาน ↓</a></div><small>Wi-Fi · ใกล้ BTS สนามกีฬาแห่งชาติ · พื้นที่ส่วนกลาง</small></div>
      <figure><img src="/figma/hotel.png" alt="อาคารโรงแรม Lub d Bangkok Siam ในยามค่ำคืน" /><figcaption>A GOOD STAY. A GREAT DAY.</figcaption></figure>
    </section>
    <section className="home-section home-overview" aria-labelledby="overview-title" aria-busy={busy} data-reveal>
      <div className="home-section-head tw:flex tw:items-center tw:justify-between tw:gap-[20px] tw:flex-wrap tw:mb-[28px]"><div><span className="eyebrow">TONIGHT AT LUB D</span><h2 id="overview-title">เช็กความพร้อมก่อนออกเดินทาง</h2><p>{overview ? `คืนนี้ ${dateLabel(overview.date)} ถึง ${dateLabel(overview.checkOutDate)} · เวลาไทย` : 'ข้อมูลห้องพักสำหรับคืนนี้ตามเวลาไทย'}</p></div><button disabled={busy} onClick={reload}>{busy ? 'กำลังโหลด…' : 'อัปเดตข้อมูล'}</button></div>
      {error && <div className="notice error" role="alert">{error} {overview ? 'ข้อมูลด้านล่างเป็นข้อมูลที่โหลดครั้งก่อน กรุณาอัปเดตอีกครั้ง' : 'ยังแสดงจำนวนห้องและราคาไม่ได้ กรุณาลองอัปเดตข้อมูล'}</div>}
      {overview ? <><div className="home-stat-grid" aria-live="polite"><article><span>ห้องว่างที่จองได้คืนนี้</span><strong data-stat="available">{overview.availableRooms}</strong><small>ห้อง · ตรวจสอบตามวันที่อีกครั้งก่อนจอง</small></article><article><span>ห้องที่มีการจองคืนนี้</span><strong data-stat="booked">{overview.bookedRooms}</strong><small>รายการยืนยันแล้ว / กำลังเข้าพัก</small></article><article><span>ราคาเริ่มต้นต่อห้อง</span><strong>{minimum === null ? '—' : `฿${money(minimum)}`}</strong><small>ต่อคืน · ราคาปัจจุบันของประเภทห้อง</small></article></div><p className="home-data-note">ข้อมูล ณ {new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(overview.updatedAt))} · ห้องในระบบที่เปิดใช้งาน {overview.totalRooms} ห้อง · ห้องซ่อมบำรุงหรือไม่พร้อมใช้งานไม่นับเป็นห้องว่าง</p></> : !error && <p className="loading" role="status">กำลังตรวจสอบห้องว่างและราคาจากระบบ…</p>}
    </section>
    <section id="home-rooms" className="home-section" aria-labelledby="rooms-title" data-reveal>
      <div className="home-section-head tw:flex tw:items-center tw:justify-between tw:gap-[20px] tw:flex-wrap tw:mb-[28px]"><div><span className="eyebrow">FIND YOUR STAY</span><h2 id="rooms-title">เลือกห้องที่เหมาะกับคุณ</h2><p>ราคาเป็นบาทต่อห้องต่อคืน · จำนวนห้องว่างด้านล่างสำหรับคืนนี้</p></div><button onClick={hotel}>เลือกวันเข้าพัก</button></div>
      {overview ? overview.roomTypes.length ? <div className="home-room-grid">{overview.roomTypes.map(type => <article key={type.id} className="home-room-card" data-reveal><span className={'pill ' + (type.availableRooms ? 'good' : '')}>{type.availableRooms ? `คืนนี้ว่าง ${type.availableRooms} ห้อง` : 'คืนนี้ไม่มีห้องว่าง'}</span><span className="home-room-symbol" aria-hidden="true">☾</span><h3>{type.name}</h3><p>รองรับสูงสุด {type.capacity} คน · ทั้งหมด {type.totalRooms} ห้อง</p>{type.amenities.length > 0 && <ul>{type.amenities.map((amenity, index) => <li key={index}>{amenity}</li>)}</ul>}<div className="home-room-price tw:mt-auto tw:pt-[12px]"><strong>฿{money(type.pricePerNight)}</strong><span> / คืน</span></div><button className="primary" onClick={hotel}>ดูห้องว่างตามวันที่</button></article>)}</div> : <div className="public-empty"><h3>ยังไม่มีห้องพักเปิดให้บริการในระบบ</h3><p>กรุณาติดต่อพนักงาน หรือกลับมาตรวจสอบอีกครั้งภายหลัง</p></div> : <p>{error ? 'รายละเอียดห้องจะแสดงเมื่อเชื่อมต่อระบบได้' : 'กำลังโหลดตัวเลือกห้องพัก…'}</p>}
    </section>
    <section id="home-guide" className="home-section home-guide" aria-labelledby="guide-title" data-reveal><span className="eyebrow">YOUR STAY, STEP BY STEP</span><h2 id="guide-title">เริ่มใช้งานได้ใน 4 ขั้นตอน</h2><ol><li><span>01</span><h3>เลือกวันเข้าพัก</h3><p>เลือกวันเช็กอิน–เช็กเอาต์ พักได้ 1–365 คืน แล้วตรวจสอบห้องว่างตามช่วงวันของคุณ</p></li><li><span>02</span><h3>เลือกประเภทและเลขห้อง</h3><p>เปรียบเทียบราคาและความจุ เลือกเลขห้องที่ว่างครบทุกคืน หนึ่งห้องต่อหนึ่งการจอง</p></li><li><span>03</span><h3>เข้าสู่ระบบและยืนยันจอง</h3><p>ใช้บัญชีสมาชิก กรอกเบอร์โทรและเลขเอกสาร ตรวจยอดรวม แล้วกดยืนยันจอง ระบบบันทึกห้องพักให้เมื่อจองสำเร็จ</p></li><li><span>04</span><h3>ชำระที่โรงแรมและเข้าพัก</h3><p>เก็บเลขอ้างอิงจากการจอง หรือเปิด “การจองของฉัน” เพื่อแสดงต่อพนักงานเมื่อมาถึงโรงแรม</p></li></ol><p className="home-guide-note">เว็บไซต์รับยืนยันการจองห้องพัก โดยชำระเงินที่โรงแรม ห้องว่างและราคาจะตรวจอีกครั้งเมื่อยืนยันสำเร็จ</p></section>
    <section className="home-section home-faq" aria-labelledby="faq-title" data-reveal><div><span className="eyebrow">GOOD TO KNOW</span><h2 id="faq-title">ก่อนจอง ควรรู้อะไรบ้าง?</h2><p>ข้อมูลที่ช่วยให้การเข้าพักของคุณชัดเจนตั้งแต่เริ่มต้น</p></div><div><details><summary>ต้องสมัครสมาชิกก่อนค้นหาหรือไม่?</summary><p>ค้นหาวันพัก ประเภทห้อง และเลขห้องได้โดยไม่ต้องเข้าสู่ระบบ เมื่อต้องการยืนยันการจองจึงเข้าสู่ระบบหรือสมัครสมาชิก</p></details><details><summary>ห้องว่างหน้าแรกต่างจากผลค้นหาอย่างไร?</summary><p>หน้าแรกแสดงห้องสำหรับคืนนี้ ส่วนหน้าค้นหาตรวจว่าห้องเดิมว่างครบทุกคืนในช่วงวันที่เลือก จึงอาจมีจำนวนต่างกัน</p></details><details><summary>ต้องชำระเงินออนไลน์หรือไม่?</summary><p>ยืนยันการจองผ่านเว็บไซต์ได้ และชำระเงินที่โรงแรม ราคาตอนยืนยันจะบันทึกไว้กับการจอง หากต้องการแก้ไขหรือยกเลิกให้ติดต่อพนักงาน</p></details></div></section>
    <section className="home-cta" data-reveal><div><h2>พร้อมสำหรับวันพักของคุณแล้วหรือยัง?</h2><p>เลือกวันพัก แล้วค้นหาห้องที่เหมาะกับคุณ</p></div><button className="primary" onClick={hotel}>ค้นหาห้องพัก</button></section>
    <footer className="home-footer"><a className="home-link" href="/" aria-label="Lub d หน้าแรก"><Brand publicLogo /></a><span>BANGKOK SIAM · A GOOD STAY. A GREAT DAY.</span><button onClick={staff}>{user && user.role !== 'customer' ? 'ระบบพนักงาน' : 'สำหรับพนักงาน'}</button></footer>
  </div></main>

}
