import demoCalendar from '@/data/demo-calendar.json'
import eventTemplates from '@/data/demo-event-templates.json'
import type { CalendarData } from './types'
import { addDays, startOfWeek, toISO } from './date'

function isCalendarData(value: unknown): value is CalendarData {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CalendarData>
  return candidate.version === 2 && Array.isArray(candidate.blocks) && Array.isArray(candidate.categories) && !!candidate.settings
}

export function normalizeCalendarData(value: CalendarData): CalendarData {
  const categories=value.categories.map(c=>({...c,groupId:c.groupId??(['health','personal'].includes(c.id)?'life':'work')}))
  const series=new Map<string,typeof value.blocks>();value.blocks.forEach(b=>{if(b.seriesId)series.set(b.seriesId,[...(series.get(b.seriesId)??[]),b])});const dominant=(members:typeof value.blocks,key:'start'|'end')=>{const counts=new Map<number,number>();members.forEach(b=>counts.set(b[key],(counts.get(b[key])??0)+1));return Array.from(counts.entries()).sort((a,b)=>b[1]-a[1])[0]?.[0]}
  const blocks=value.blocks.map(b=>{if(!b.seriesId)return b;const members=series.get(b.seriesId)??[b];return {...b,recurrenceDate:b.recurrenceDate??b.date,recurrenceStart:b.recurrenceStart??dominant(members,'start')??b.start,recurrenceEnd:b.recurrenceEnd??dominant(members,'end')??b.end}})
  return {...value,blocks,categories,groups:value.groups?.length?value.groups:[{id:'work',name:'WORK'},{id:'life',name:'LIFE'}],quoteBank:value.quoteBank?.length?value.quoteBank:['Shape the week before it shapes you.'],currentQuote:value.currentQuote??'Shape the week before it shapes you.',deletedCalendars:value.deletedCalendars??[],settings:{...value.settings,hourScale:value.settings.hourScale??1,planLabel:value.settings.planLabel??'Plan',actualLabel:value.settings.actualLabel??'Actual',autoFormatTitles:value.settings.autoFormatTitles??false,defaultCategoryId:value.settings.defaultCategoryId&&categories.some(c=>c.id===value.settings.defaultCategoryId)?value.settings.defaultCategoryId:categories[0]?.id??''}}
}

export function loadDemoCalendar(): CalendarData {
  if (!isCalendarData(demoCalendar)) throw new Error('The bundled demo calendar is invalid')
  const base=normalizeCalendarData(structuredClone(demoCalendar) as CalendarData),week=startOfWeek(new Date())
  const blocks=eventTemplates.map((template,index)=>({...template,id:`demo-${template.layer}-${index+1}`,date:toISO(addDays(week,template.weekday))}))
  return {...base,blocks} as CalendarData
}
