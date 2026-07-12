import { Check } from 'lucide-react'
import type { CalendarCategory, CalendarGroup } from '@/lib/calendar/types'

type Props={groups:CalendarGroup[];calendars:CalendarCategory[];excludeId?:string;selectedId?:string;onChoose:(id:string)=>void}
export function GroupedCalendarList({groups,calendars,excludeId,selectedId,onChoose}:Props){
  return <div className="grouped-calendar-list">{groups.map(group=>{const items=calendars.filter(c=>c.groupId===group.id&&c.id!==excludeId);if(!items.length)return null;return <section key={group.id}><div className="calendar-list-divider"><span>{group.name}</span><i/></div>{items.map(c=><button key={c.id} onClick={()=>onChoose(c.id)}><i style={{background:c.color}}/><span>{c.name}</span>{c.id===selectedId&&<Check size={11}/>}</button>)}</section>})}</div>
}
