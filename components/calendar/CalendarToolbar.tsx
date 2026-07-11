import { ChevronDown, Copy, Minus, Plus } from 'lucide-react'
import type { Layer } from '@/lib/calendar/types'

type Props={layer:Layer;subtitle:string;onCopyPlan:()=>void;onZoom:(n:-1|1)=>void;onDisplay:()=>void}
export function CalendarToolbar({layer,subtitle,onCopyPlan,onZoom,onDisplay}:Props){
  return <div className="calendar-toolbar"><div><span>{subtitle}</span></div><div>{layer==='actual'&&<button className="fill-plan-button" onClick={onCopyPlan}><Copy size={13}/>Fill from plan</button>}<span className="density-control"><button aria-label="Zoom hours out" onClick={()=>onZoom(-1)}><Minus size={13}/></button><small>Hour scale</small><button aria-label="Zoom hours in" onClick={()=>onZoom(1)}><Plus size={13}/></button></span><button className="toolbar-menu" onClick={onDisplay}>Display options <ChevronDown size={13}/></button></div></div>
}
