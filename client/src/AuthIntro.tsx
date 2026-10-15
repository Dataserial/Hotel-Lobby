// ส่วนแนะนำบนหน้าเข้าสู่ระบบ
// แสดงส่วนแนะนำของหน้าเข้าสู่ระบบ
export default function AuthIntro({ registering, staff }: { registering: boolean; staff: boolean }) {
  return <aside className="auth-intro" aria-label={staff ? 'ระบบจัดการโรงแรม' : 'แนะนำบัญชีสมาชิก'}>
    <div className="auth-intro-copy"><span className="eyebrow">{staff ? 'HOTEL OPERATIONS' : 'YOUR NEXT GOOD STAY'}</span><span className="auth-crescent" aria-hidden="true">☾</span><h1>{staff ? <>ทุกการเข้าพัก<br />เริ่มจากการดูแลที่ดี</> : registering ? <>วันพักที่ดี<br />เริ่มต้นที่นี่</> : <>ยินดีต้อนรับ<br />กลับมาพักใจ</>}</h1><p>{staff ? 'จัดการห้องพัก การจอง และการเข้าพัก ในพื้นที่ทำงานของทีมโรงแรม' : 'ค้นหาห้องที่เหมาะกับคุณ แล้วให้เราช่วยเตรียมการเข้าพักครั้งต่อไป'}</p><ul>{staff ? <><li>ตรวจห้องว่างและจัดการการจอง</li><li>ดูแลการเช็กอิน เช็กเอาต์ และหลักฐานชำระเงิน</li></> : <><li>ค้นหาห้องว่างและเปรียบเทียบราคา</li><li>จัดการชื่อและอีเมลในบัญชีของคุณ</li><li>เลือกเลขห้องและยืนยันการจองผ่านเว็บไซต์</li></>}</ul></div>
    <div className="auth-photo"><img src="/figma/lobby.png" alt="พื้นที่พักผ่อนและล็อบบี้ของโรงแรม Lub d" /><span>A GOOD STAY. A GREAT DAY.</span></div>
  </aside>
}
