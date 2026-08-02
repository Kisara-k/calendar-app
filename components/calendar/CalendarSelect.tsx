'use client'
import { ChevronDown } from 'lucide-react'
import { useRef, useState } from 'react'
import type { CalendarCategory, CalendarGroup } from '@/lib/calendar/types'
import { GroupedCalendarList } from './GroupedCalendarList'
import { useAnchoredMenuPosition, useDismiss } from './FloatingMenuCore'
export function CalendarSelect({value,calendars,groups,onChange}:{value:string;calendars:CalendarCategory[];groups:CalendarGroup[];onChange:(id:string)=>void}){const[open,setOpen]=useState(false),btnRef=useRef<HTMLButtonElement>(null),popoverRef=useRef<HTMLDivElement>(null),ref=useDismiss(()=>setOpen(false),open),popStyle=useAnchoredMenuPosition(btnRef,popoverRef,open,{width:'anchor'}),selected=calendars.find(c=>c.id===value);return <div className="calendar-select" ref={ref}><button ref={btnRef} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><i style={{background:selected?.color}}/><span>{selected?.name??'Choose calendar'}</span><ChevronDown size={12}/></button>{open&&<div ref={popoverRef} className="calendar-select-popover" style={popStyle}><GroupedCalendarList groups={groups} calendars={calendars} selectedId={value} onChoose={id=>{onChange(id);setOpen(false)}}/></div>}</div>}
