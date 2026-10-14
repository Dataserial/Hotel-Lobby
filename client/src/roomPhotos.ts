/** User-supplied illustrative photos, not verified photographs of assigned rooms. */
export function roomPhoto(name: string): string {
  if (/family|ครอบครัว|แฟมิล/i.test(name)) return '/rooms/family.png'
  if (/deluxe|ดีลัก/i.test(name)) return '/rooms/deluxe.png'
  return '/rooms/standard.png'
}
