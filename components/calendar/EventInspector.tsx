'use client'
import { CalendarDays, Check, Copy, FileText, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatTime } from '@/lib/calendar/date'
import type { ActualStatus, CalendarBlock, CalendarCategory, CalendarGroup, CalendarSettings, Layer } from '@/lib/calendar/types'
import { toTitleCase } from '@/lib/calendar/title-case'
import { CalendarSelect } from './CalendarSelect'

type Props={block:CalendarBlock;isDraft:boolean;categories:CalendarCategory[];groups:CalendarGroup[];settings:CalendarSettings;onChange:(b:CalendarBlock)=>void;onDelete:()=>void;onDuplicate:()=>void;onCopyLayer:(layer:Layer)=>void;onClose:()=>void}
const timeValue=(n:number)=>`${String(Math.floor(n)).padStart(2,'0')}:${String(Math.round(n%1*60)).padStart(2,'0')}`
const fromTime=(s:string)=>{const [h,m]=s.split(':').map(Number);return h+m/60}

export function EventInspector({block,isDraft,categories,groups,settings,onChange,onDelete,onDuplicate,onCopyLayer,onClose}:Props){const [title,setTitle]=useState(block.title),originalTitle=useRef(block.title);useEffect(()=>setTitle(block.title),[block.id,block.title]);useEffect(()=>{originalTitle.current=block.title},[block.id]);const patch=(p:Partial<CalendarBlock>)=>onChange({...block,...p});const commitTitle=(raw:string)=>{const next=settings.autoFormatTitles&&raw.trim()?toTitleCase(raw):raw;setTitle(next);patch({title:next})};return <aside className="context-panel event-inspector">
  <div className="panel-head"><span><CalendarDays size={15}/>{isDraft?'New block':block.layer==='plan'?'Planned block':'Actual block'}</span><button className="quiet-icon" aria-label="Close inspector" onClick={onClose}><X size={16}/></button></div>
  <div className="inspector-body"><input className="event-title-input" aria-label="Event title" placeholder="Add title" value={title} autoFocus={isDraft} onFocus={()=>{originalTitle.current=block.title}} onChange={e=>{const next=e.target.value;setTitle(next);patch({title:next})}} onBlur={e=>commitTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitTitle(title);e.currentTarget.blur()}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();const previous=originalTitle.current;setTitle(previous);patch({title:previous});e.currentTarget.blur()}}}/>
    <div className="event-meta-line"><i style={{background:categories.find(c=>c.id===block.categoryId)?.color}}/><span>{formatTime(block.start)} – {formatTime(block.end)}</span><b>{Math.round((block.end-block.start)*60)} min</b></div>
    <label className="field-label"><span>Date</span><input type="date" value={block.date} onChange={e=>patch({date:e.target.value})}/></label><div className="field-pair"><label className="field-label"><span>Starts</span><input type="time" value={timeValue(block.start)} onChange={e=>{const start=fromTime(e.target.value);patch({start,end:Math.max(start+.25,block.end)})}}/></label><label className="field-label"><span>Ends</span><input type="time" value={timeValue(block.end)} onChange={e=>patch({end:Math.max(block.start+.25,fromTime(e.target.value))})}/></label></div>
    <label className="field-label"><span>Calendar</span><CalendarSelect value={block.categoryId} calendars={categories} groups={groups} onChange={categoryId=>patch({categoryId})}/></label>
    {block.layer==='actual'&&<label className="field-label"><span>Outcome</span><div className="status-grid">{(['completed','partial','skipped','unplanned'] as ActualStatus[]).map(s=><button key={s} className={block.status===s?'active':''} onClick={()=>patch({status:s})}>{s==='completed'&&<Check size={12}/>}<span>{s}</span></button>)}</div></label>}
    <label className="field-label"><span><FileText size={12}/>Notes</span><textarea placeholder="Add notes…" value={block.notes??''} onChange={e=>patch({notes:e.target.value})}/></label><div className="inspector-actions"><button onClick={onDuplicate}><Copy size={13}/>Duplicate</button><button onClick={()=>onCopyLayer(block.layer==='plan'?'actual':'plan')}><RotateCcw size={13}/>Copy to {block.layer==='plan'?'Actual':'Plan'}</button></div>
  </div><div className="panel-footer"><button className="danger-button" onClick={onDelete}><Trash2 size={14}/>{isDraft?'Discard':'Delete'}</button><span><small>{isDraft?'Add a title or change calendar to keep it':'Changes save automatically'}</small></span></div>
</aside>}
