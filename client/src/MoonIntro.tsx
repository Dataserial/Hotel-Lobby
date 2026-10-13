import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import './MoonIntro.css'

export default function MoonIntro({ begin }: { begin: () => void }) {
  const intro = useRef<HTMLElement>(null)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setProgress(Math.min(1, Math.max(0, -(intro.current?.getBoundingClientRect().top || 0) / window.innerHeight)))) }
    window.addEventListener('scroll', update, { passive: true }); window.addEventListener('resize', update); update()
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [])
  return <section ref={intro} className="moon-journey" aria-label="ยินดีต้อนรับสู่ Lub d"><div className="moon-night" style={{ '--journey': progress } as CSSProperties}>
    <img className="intro-moon" src="/figma/moon.svg" alt="พระจันทร์" /><p className="moon-quote">“พักให้เต็มที่ แล้วเริ่มวันใหม่”</p><button className="scroll-start" onClick={begin}>เลื่อนลงเพื่อเริ่มต้น ↓</button>
  </div></section>
}
