// แสดงเนื้อหาเมื่อเลื่อนหน้าจอ
/* แสดงเนื้อหาครั้งเดียวเมื่อเลื่อนถึง และยังเข้าถึงได้ด้วยแป้นพิมพ์ */
// เตรียมแสดงส่วนต่าง ๆ เมื่อเลื่อนมาถึง
export function setupReveal(root: HTMLElement): () => void {
  const view = root.ownerDocument.defaultView
  const preference = view?.matchMedia?.('(prefers-reduced-motion: reduce)')
  if (!view || !view.IntersectionObserver || preference?.matches) return () => {}

  const tracked = new Set<HTMLElement>()
  // แสดงเนื้อหาและหยุดเฝ้าดูเมื่อแสดงแล้ว
  const reveal = (element: HTMLElement) => {
    element.classList.add('is-revealed')
    observer.unobserve(element)
  }
  const observer = new view.IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) reveal(entry.target as HTMLElement)
  }, { threshold: 0, rootMargin: '0px 0px -24px 0px' })
  // ค้นหาส่วนที่ต้องแสดงเมื่อเลื่อนหน้า
  const discover = () => {
    for (const element of tracked) if (!root.contains(element)) {
      observer.unobserve(element)
      tracked.delete(element)
    }
    for (const element of root.querySelectorAll<HTMLElement>('[data-reveal]')) {
      if (tracked.has(element)) continue
      tracked.add(element)
      element.classList.add('reveal-pending')
      observer.observe(element)
    }
  }
  // แสดงส่วนที่ผู้ใช้เลื่อนโฟกัสมาถึง
  const focus = (event: FocusEvent) => {
    for (const element of tracked) if (element.contains(event.target as Node)) reveal(element)
  }
  // ลดการเคลื่อนไหวตามการตั้งค่าผู้ใช้
  const reduce = () => {
    if (!preference?.matches) return
    for (const element of tracked) reveal(element)
  }
  const mutations = new view.MutationObserver(discover)
  discover()
  mutations.observe(root, { childList: true, subtree: true })
  root.addEventListener('focusin', focus)
  preference?.addEventListener?.('change', reduce)
  return () => {
    observer.disconnect()
    mutations.disconnect()
    root.removeEventListener('focusin', focus)
    preference?.removeEventListener?.('change', reduce)
    for (const element of tracked) element.classList.remove('reveal-pending', 'is-revealed')
    tracked.clear()
  }
}
