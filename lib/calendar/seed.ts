import demoCalendar from '@/data/demo-calendar.json'
import type { CalendarData } from './types'

function isCalendarData(value: unknown): value is CalendarData {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CalendarData>
  return candidate.version === 2 && Array.isArray(candidate.blocks) && Array.isArray(candidate.categories) && !!candidate.settings
}

export function loadDemoCalendar(): CalendarData {
  if (!isCalendarData(demoCalendar)) throw new Error('The bundled demo calendar is invalid')
  return structuredClone(demoCalendar) as CalendarData
}
