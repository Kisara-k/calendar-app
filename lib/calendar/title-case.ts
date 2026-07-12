import TitleCaser from '@danielhaim/titlecaser'

const caser = new TitleCaser({ style: 'ap' })

export function toTitleCase(text: string): string {
  if (!text.trim()) return text
  try { return caser.toTitleCase(text) } catch { return text }
}
