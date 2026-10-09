export function Brand({ publicLogo = false }: { publicLogo?: boolean }) {
  return <span className="lub-brand">Lub d {publicLogo ? <img src="/figma/brand-moon.svg" alt="" /> : <span aria-hidden="true">☾</span>}</span>
}
