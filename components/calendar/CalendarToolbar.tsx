'use client'
import { ChevronDown, Copy, Eye, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CalendarSettings, Layer } from '@/lib/calendar/types'
import { CalendarDropdown } from './CalendarDropdown'
import { useAnchoredMenuPosition, useDismiss } from './FloatingMenuCore'
import { HourScaleSlider } from './HourScaleSlider'

type Props={layer:Layer;quote:string;settings:CalendarSettings;onQuote:(v:string)=>void;onNextQuote:()=>void;onCopyPlan:()=>void;onPatch:(p:Partial<CalendarSettings>)=>void}
export function CalendarToolbar(p:Props){
  const [quote,setQuote]=useState(p.quote),[open,setOpen]=useState(false),buttonRef=useRef<HTMLButtonElement>(null),popoverRef=useRef<HTMLDivElement>(null),menuRef=useDismiss(()=>setOpen(false),open),popoverStyle=useAnchoredMenuPosition(buttonRef,popoverRef,open,{align:'end',width:220})
  useEffect(()=>setQuote(p.quote),[p.quote])
  const commitQuote=()=>{if(quote!==p.quote)p.onQuote(quote)}
  return <div className="calendar-toolbar"><div className="quote-editor"><input aria-label="Weekly quote" value={quote} onChange={e=>setQuote(e.target.value)} onBlur={commitQuote} onKeyDown={e=>{if(e.key==='Enter'){commitQuote();e.currentTarget.blur()}if(e.key==='Escape'){setQuote(p.quote);e.currentTarget.blur()}}}/><button aria-label="Load random quote" title="Load random quote" onClick={p.onNextQuote}><RefreshCw size={12}/></button></div><div>{p.layer==='actual'&&<button className="fill-plan-button" onClick={p.onCopyPlan}><Copy size={13}/>Fill from plan</button>}<label className="top-density"><span className="height-indicator" aria-hidden="true">↕</span><HourScaleSlider aria-label="Hour height" value={p.settings.hourScale} onChange={v=>p.onPatch({hourScale:v})}/><small>{p.settings.hourScale.toFixed(2)}×</small></label><div className="display-menu-wrap" ref={menuRef}><button ref={buttonRef} className={`toolbar-menu ${open?'active':''}`} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>Display options <ChevronDown size={13}/></button>{open&&<div ref={popoverRef} className="display-popover" style={popoverStyle}><label><span><Eye size={13}/>Show weekends</span><input type="checkbox" checked={p.settings.showWeekends} onChange={e=>p.onPatch({showWeekends:e.target.checked})}/></label><label><span>Time format</span><CalendarDropdown compact ariaLabel="Time format" value={p.settings.timeFormat} options={[{value:'12h',label:'12 hour'},{value:'24h',label:'24 hour'}]} onChange={timeFormat=>p.onPatch({timeFormat})}/></label><label className="display-density"><span>Hour height</span><HourScaleSlider value={p.settings.hourScale} onChange={v=>p.onPatch({hourScale:v})}/><small>{p.settings.hourScale.toFixed(2)}×</small></label></div>}</div></div></div>
}
