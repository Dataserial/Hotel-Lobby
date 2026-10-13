/** One-shot scroll entrances, with visible fallback and keyboard access. */
export function setupReveal(root: HTMLElement): () => void {
  const view = root.ownerDocument.defaultView
  const preference = view?.matchMedia?.('(prefers-reduced-motion: reduce)')
  if (!view || !view.IntersectionObserver || preference?.matches) return () => {}

  const tracked = new Set<HTMLElement>()
  const reveal = (element: HTMLElement) => {
    element.classList.add('is-revealed')
    observer.unobserve(element)
  }
  const observer = new view.IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) reveal(entry.target as HTMLElement)
  }, { threshold: 0, rootMargin: '0px 0px -24px 0px' })
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
  const focus = (event: FocusEvent) => {
    for (const element of tracked) if (element.contains(event.target as Node)) reveal(element)
  }
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
