'use client'
import { Check, Copy, GitMerge, Palette, Pencil, Star, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CATEGORY_COLORS } from '@/lib/calendar/constants'
import type { CalendarBlock, CalendarCategory, Layer } from '@/lib/calendar/types'

function useDismiss(onClose:()=>void){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{const down=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))onClose()};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('pointerdown',down);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',down);window.removeEventListener('keydown',key)}},[onClose]);return ref}
const position=(x:number,y:number)=>({left:Math.min(x,window.innerWidth-230),top:Math.min(y,window.innerHeight-320)})

type CalendarMenuProps={x:number;y:number;calendar:CalendarCategory;calendars:CalendarCategory[];isDefault:boolean;onRename:(v:string)=>void;onColor:(v:string)=>void;onDefault:()=>void;onDelete:()=>void;onMerge:(target:string)=>void;onClose:()=>void}
export function CalendarMenu(p:CalendarMenuProps){const ref=useDismiss(p.onClose);const [renaming,setRenaming]=useState(false);const [name,setName]=useState(p.calendar.name);const [merge,setMerge]=useState('');const commitName=()=>{p.onRename(name);setRenaming(false)};return <div ref={ref} className="floating-menu calendar-menu" style={position(p.x,p.y)} onContextMenu={e=>e.preventDefault()}>
  <div className="floating-menu-title"><i style={{background:p.calendar.color}}/><span>{p.calendar.name}</span><button onClick={p.onClose}><X size={13}/></button></div>
  {renaming?<div className="menu-rename"><input autoFocus value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')commitName();if(e.key==='Escape')setRenaming(false)}}/><button onClick={commitName}><Check size={13}/></button></div>:<button onClick={()=>setRenaming(true)}><Pencil size={14}/>Rename</button>}
  <button className={p.isDefault?'menu-checked':''} onClick={p.onDefault}><Star size={14}/>{p.isDefault?'Default calendar':'Make default calendar'}{p.isDefault&&<Check size={12}/>}</button>
  <div className="menu-section-label"><Palette size={12}/>COLOR</div><div className="color-grid">{CATEGORY_COLORS.map(color=><button key={color} aria-label={`Use color ${color}`} className={color===p.calendar.color?'selected':''} style={{background:color}} onClick={()=>p.onColor(color)}>{color===p.calendar.color&&<Check size={11}/>}</button>)}</div>
  <div className="menu-section-label"><GitMerge size={12}/>MERGE INTO</div><div className="merge-row"><select value={merge} onChange={e=>setMerge(e.target.value)}><option value="">Choose calendar…</option>{p.calendars.filter(c=>c.id!==p.calendar.id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button disabled={!merge} onClick={()=>merge&&p.onMerge(merge)}>Merge</button></div>
  <div className="menu-divider"/><button className="menu-danger" onClick={p.onDelete}><Trash2 size={14}/>Delete calendar</button>
  </div>}

type EventMenuProps={x:number;y:number;block:CalendarBlock;calendars:CalendarCategory[];onDuplicate:()=>void;onCopyLayer:(layer:Layer)=>void;onCalendar:(id:string)=>void;onDelete:()=>void;onClose:()=>void}
export function EventMenu(p:EventMenuProps){const ref=useDismiss(p.onClose);return <div ref={ref} className="floating-menu event-menu" style={position(p.x,p.y)} onContextMenu={e=>e.preventDefault()}><button onClick={p.onDuplicate}><Copy size={14}/>Duplicate</button><button onClick={()=>p.onCopyLayer(p.block.layer==='plan'?'actual':'plan')}><Copy size={14}/>Copy to {p.block.layer==='plan'?'Actual':'Plan'}</button><div className="menu-section-label">MOVE TO CALENDAR</div>{p.calendars.map(c=><button key={c.id} onClick={()=>p.onCalendar(c.id)}><i style={{background:c.color}}/>{c.name}{c.id===p.block.categoryId&&<Check size={12}/>}</button>)}<div className="menu-divider"/><button className="menu-danger" onClick={p.onDelete}><Trash2 size={14}/>Delete block</button></div>}
