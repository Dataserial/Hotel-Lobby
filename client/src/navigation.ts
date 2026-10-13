const paths: Record<string, string> = { home: '/', discover: '/discover', hotel: '/hotel', staff: '/staff', member: '/member', register: '/register' }

export function currentPath() {
  const legacy = paths[window.location.hash.slice(1)]
  if (legacy) window.history.replaceState(null, '', legacy + window.location.search)
  return window.location.pathname.replace(/\/$/, '') || '/'
}

export function navigate(path: string) {
  if (window.location.pathname !== path || window.location.hash) window.history.pushState(null, '', path)
  window.dispatchEvent(new window.PopStateEvent('popstate'))
}

export function handleNavigation(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  const anchor = event.target instanceof window.Element ? event.target.closest('a') : null
  if (!anchor || anchor.target || anchor.hasAttribute('download')) return
  const href = anchor.getAttribute('href')
  if (!href || !Object.values(paths).includes(href)) return
  event.preventDefault()
  navigate(href)
}
