import { BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight, HelpCircle, Plus, Settings2 } from 'lucide-react'
import { addDays, startOfWeek, toISO } from '@/lib/calendar/date'
import type { CalendarCategory, Panel } from '@/lib/calendar/types'

type Props={anchor:Date;categories:CalendarCategory[];panel:Panel;onAnchor:(d:Date)=>void;onToggleCategory:(id:string)=>void;onNew:()=>void;onPanel:(p:Panel)=>void}

export function Sidebar({anchor,categories,panel,onAnchor,onToggleCategory,onNew,onPanel}:Props){
  const monthStart=new Date(anchor.getFullYear(),anchor.getMonth(),1)
  const leading=(monthStart.getDay()+6)%7
  const days=new Date(anchor.getFullYear(),anchor.getMonth()+1,0).getDate()
  const selectedWeek=startOfWeek(anchor)
  return <aside className="left-sidebar">
    <button className="create-button" onClick={onNew}><Plus size={16}/>Create block<kbd>N</kbd></button>
    <section className="mini-calendar"><div className="mini-title"><b>{anchor.toLocaleString('en',{month:'long',year:'numeric'})}</b><span><button aria-label="Previous month" onClick={()=>onAnchor(new Date(anchor.getFullYear(),anchor.getMonth()-1,1))}><ChevronLeft size={14}/></button><button aria-label="Next month" onClick={()=>onAnchor(new Date(anchor.getFullYear(),anchor.getMonth()+1,1))}><ChevronRight size={14}/></button></span></div><div className="mini-weekdays">{'MTWTFSS'.split('').map((x,i)=><span key={i}>{x}</span>)}</div><div className="mini-days">{Array.from({length:leading},(_,i)=><i key={`e${i}`}/>)}{Array.from({length:days},(_,i)=>{const date=new Date(anchor.getFullYear(),anchor.getMonth(),i+1);const inWeek=date>=selectedWeek&&date<=addDays(selectedWeek,6);const today=toISO(date)===toISO(new Date());return <button key={i} className={`${inWeek?'in-week ':''}${today?'today':''}`} onClick={()=>onAnchor(date)}>{i+1}</button>})}</div></section>
    <section className="sidebar-section"><div className="sidebar-heading"><span>CALENDARS</span><button aria-label="Add calendar"><Plus size={13}/></button></div>{categories.map(c=><button className="calendar-toggle" key={c.id} onClick={()=>onToggleCategory(c.id)}><span className={`color-check ${c.visible?'visible':''}`} style={{'--category':c.color} as React.CSSProperties}>{c.visible&&<Check size={10}/>}</span><span>{c.name}</span><i style={{background:c.color}}/></button>)}</section>
    <nav className="sidebar-nav"><button className={panel==='insights'?'active':''} onClick={()=>onPanel('insights')}><BarChart3 size={15}/>Weekly insights</button><button className={panel==='settings'?'active':''} onClick={()=>onPanel('settings')}><Settings2 size={15}/>Settings</button><button className={panel==='shortcuts'?'active':''} onClick={()=>onPanel('shortcuts')}><HelpCircle size={15}/>Keyboard shortcuts</button></nav>
    <div className="sidebar-account"><div>TK</div><span><b>Local workspace</b><small>Saved on this device</small></span><CalendarDays size={15}/></div>
  </aside>
}
