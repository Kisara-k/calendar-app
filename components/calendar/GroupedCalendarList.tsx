import { Check } from 'lucide-react'
import type { CalendarCategory, CalendarGroup } from '@/lib/calendar/types'

type Props={groups:CalendarGroup[];calendars:CalendarCategory[];excludeId?:string;selectedId?:string;selectedIds?:string[];onChoose:(id:string)=>void}
export function GroupedCalendarList({groups,calendars,excludeId,selectedId,selectedIds,onChoose}:Props){
  return <div className="grouped-calendar-list">{groups.map(group=>{const items=calendars.filter(c=>c.groupId===group.id&&c.id!==excludeId);if(!items.length)return null;return <section key={group.id}><div className="calendar-list-divider"><span>{group.name}</span><i/></div>{items.map(c=>{const selected=c.id===selectedId||selectedIds?.includes(c.id);return <button key={c.id} aria-pressed={selectedIds?!!selected:undefined} onClick={()=>onChoose(c.id)}><i style={{background:c.color}}/><span>{c.name}</span>{selected&&<Check size={11}/>}</button>})}</section>})}</div>
}
