import demoCalendar from '@/data/demo-calendar.json'
import type { CalendarData } from './types'

function isCalendarData(value: unknown): value is CalendarData {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CalendarData>
  return candidate.version === 2 && Array.isArray(candidate.blocks) && Array.isArray(candidate.categories) && !!candidate.settings
}

export function normalizeCalendarData(value: CalendarData): CalendarData {
  const categories=value.categories.map(c=>({...c,groupId:c.groupId??(['health','personal'].includes(c.id)?'life':'work')}))
  return {...value,categories,groups:value.groups?.length?value.groups:[{id:'work',name:'WORK'},{id:'life',name:'LIFE'}],quoteBank:value.quoteBank?.length?value.quoteBank:['Shape the week before it shapes you.'],currentQuote:value.currentQuote??'Shape the week before it shapes you.',settings:{...value.settings,hourScale:value.settings.hourScale??1,defaultCategoryId:value.settings.defaultCategoryId&&categories.some(c=>c.id===value.settings.defaultCategoryId)?value.settings.defaultCategoryId:categories[0]?.id??''}}
}

export function loadDemoCalendar(): CalendarData {
  if (!isCalendarData(demoCalendar)) throw new Error('The bundled demo calendar is invalid')
  return normalizeCalendarData(structuredClone(demoCalendar) as CalendarData)
}
