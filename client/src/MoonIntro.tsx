import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import './MoonIntro.css'

export default function MoonIntro({ begin }: { begin: () => void }) {
  const intro = useRef<HTMLElement>(null)
  const scrollFrame = useRef(0)
  const cancelJourney = useRef<(() => void) | null>(null)
  const [progress, setProgress] = useState(0)
  useEffect(() => () => cancelJourney.current?.(), [])
  const startJourney = () => {
    if (!intro.current || scrollFrame.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      begin()
      return
    }
    const start = window.scrollY
    const destination = Math.min(
      start + intro.current.getBoundingClientRect().bottom,
      document.documentElement.scrollHeight - window.innerHeight,
    )
    let startedAt: number | undefined
    const cancel = () => {
      cancelAnimationFrame(scrollFrame.current)
      scrollFrame.current = 0
      window.removeEventListener('wheel', cancel)
      window.removeEventListener('touchstart', cancel)
      window.removeEventListener('keydown', cancel)
      cancelJourney.current = null
    }
    const step = (time: number) => {
      startedAt ??= time
      const elapsed = Math.min((time - startedAt) / 1600, 1)
      const eased = elapsed < .5 ? 4 * elapsed ** 3 : 1 - (-2 * elapsed + 2) ** 3 / 2
      window.scrollTo({ top: start + (destination - start) * eased, behavior: 'instant' })
      if (elapsed < 1) scrollFrame.current = requestAnimationFrame(step)
      else cancel()
    }
    cancelJourney.current = cancel
    window.addEventListener('wheel', cancel, { passive: true })
    window.addEventListener('touchstart', cancel, { passive: true })
    window.addEventListener('keydown', cancel)
    scrollFrame.current = requestAnimationFrame(step)
  }
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setProgress(Math.min(1, Math.max(0, -(intro.current?.getBoundingClientRect().top || 0) / window.innerHeight)))) }
    window.addEventListener('scroll', update, { passive: true }); window.addEventListener('resize', update); update()
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [])
  return <section ref={intro} className="moon-journey" aria-label="ยินดีต้อนรับสู่ Lub d"><div className="moon-night" style={{ '--journey': progress } as CSSProperties}>
    <img className="intro-moon" src="/figma/moon.svg" alt="พระจันทร์" /><p className="moon-quote">“พักให้เต็มที่ แล้วเริ่มวันใหม่”</p><button className="scroll-start" onClick={startJourney}>เลื่อนลงเพื่อเริ่มต้น ↓</button>
  </div></section>
}
