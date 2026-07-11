'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Check, Copy, FileText, RotateCcw, Trash2, X } from 'lucide-react'
import { formatTime } from '@/lib/calendar/date'
import type { ActualStatus, CalendarBlock, CalendarCategory, Layer } from '@/lib/calendar/types'

type Props={block:CalendarBlock;categories:CalendarCategory[];onSave:(b:CalendarBlock)=>void;onDelete:()=>void;onDuplicate:()=>void;onCopyLayer:(layer:Layer)=>void;onClose:()=>void}
const timeValue=(n:number)=>`${String(Math.floor(n)).padStart(2,'0')}:${String(Math.round(n%1*60)).padStart(2,'0')}`
const fromTime=(s:string)=>{const [h,m]=s.split(':').map(Number);return h+m/60}

export function EventInspector({block,categories,onSave,onDelete,onDuplicate,onCopyLayer,onClose}:Props){
  const [draft,setDraft]=useState(block);const [dirty,setDirty]=useState(false)
  useEffect(()=>{setDraft(block);setDirty(false)},[block])
  const patch=(p:Partial<CalendarBlock>)=>{setDraft(v=>({...v,...p}));setDirty(true)}
  return <aside className="context-panel event-inspector" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){onSave(draft);setDirty(false)}}}>
    <div className="panel-head"><span><CalendarDays size={15}/>{block.layer==='plan'?'Planned block':'Actual block'}</span><button className="quiet-icon" aria-label="Close inspector" onClick={onClose}><X size={16}/></button></div>
    <div className="inspector-body"><input className="event-title-input" value={draft.title} autoFocus={block.title==='New event'} onFocus={e=>{if(block.title==='New event')e.currentTarget.select()}} onChange={e=>patch({title:e.target.value})}/>
      <div className="event-meta-line"><i style={{background:categories.find(c=>c.id===draft.categoryId)?.color}}/><span>{formatTime(draft.start)} – {formatTime(draft.end)}</span><b>{Math.round((draft.end-draft.start)*60)} min</b></div>
      <label className="field-label"><span>Date</span><input type="date" value={draft.date} onChange={e=>patch({date:e.target.value})}/></label>
      <div className="field-pair"><label className="field-label"><span>Starts</span><input type="time" value={timeValue(draft.start)} onChange={e=>{const start=fromTime(e.target.value);patch({start,end:Math.max(start+.25,draft.end)})}}/></label><label className="field-label"><span>Ends</span><input type="time" value={timeValue(draft.end)} onChange={e=>patch({end:Math.max(draft.start+.25,fromTime(e.target.value))})}/></label></div>
      <label className="field-label"><span>Calendar</span><select value={draft.categoryId} onChange={e=>patch({categoryId:e.target.value})}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {draft.layer==='actual'&&<label className="field-label"><span>Outcome</span><div className="status-grid">{(['completed','partial','skipped','unplanned'] as ActualStatus[]).map(s=><button key={s} className={draft.status===s?'active':''} onClick={()=>patch({status:s})}>{s==='completed'&&<Check size={12}/>}<span>{s}</span></button>)}</div></label>}
      <label className="field-label"><span><FileText size={12}/>Notes</span><textarea placeholder="Add notes…" value={draft.notes??''} onChange={e=>patch({notes:e.target.value})}/></label>
      <div className="inspector-actions"><button onClick={onDuplicate}><Copy size={13}/>Duplicate</button><button onClick={()=>onCopyLayer(draft.layer==='plan'?'actual':'plan')}><RotateCcw size={13}/>Copy to {draft.layer==='plan'?'Actual':'Plan'}</button></div>
    </div>
    <div className="panel-footer"><button className="danger-button" onClick={onDelete}><Trash2 size={14}/>Delete</button><span>{dirty&&<small>Unsaved changes</small>}<button className="primary-button" onClick={()=>{onSave(draft);setDirty(false)}}>Save</button></span></div>
  </aside>
}
