'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Bell, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, GripVertical, LayoutGrid, Menu, Moon, MoreHorizontal, Plus, Search, Settings2, Sparkles, Target, X } from 'lucide-react'

type Mode = 'plan' | 'actual'
type Category = { id: string; name: string; color: string; icon: string }
type Block = { id: string; day: number; start: number; duration: number; title: string; category: string; mode: Mode }

const START = 6
const END = 23
const HOUR = 68
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DATES = [6, 7, 8, 9, 10, 11, 12]

const categories: Category[] = [
  { id: 'deep', name: 'Deep work', color: '#8b7cf6', icon: '◆' },
  { id: 'meetings', name: 'Meetings', color: '#4bb6d9', icon: '●' },
  { id: 'health', name: 'Health', color: '#52c995', icon: '●' },
  { id: 'personal', name: 'Personal', color: '#f0a26b', icon: '●' },
  { id: 'learning', name: 'Learning', color: '#e0c15b', icon: '●' },
]

const seed: Block[] = [
  { id:'p1',day:0,start:7.5,duration:1,title:'Morning run',category:'health',mode:'plan' },
  { id:'p2',day:0,start:9,duration:2.5,title:'Product strategy',category:'deep',mode:'plan' },
  { id:'p3',day:0,start:13,duration:1,title:'Lunch with Alex',category:'personal',mode:'plan' },
  { id:'p4',day:0,start:15,duration:1.5,title:'Design review',category:'meetings',mode:'plan' },
  { id:'p5',day:1,start:8,duration:1,title:'Weekly planning',category:'deep',mode:'plan' },
  { id:'p6',day:1,start:10,duration:1,title:'Team stand-up',category:'meetings',mode:'plan' },
  { id:'p7',day:1,start:11.5,duration:2.5,title:'Focus: prototype',category:'deep',mode:'plan' },
  { id:'p8',day:1,start:17.5,duration:1.5,title:'Read & notes',category:'learning',mode:'plan' },
  { id:'p9',day:2,start:7,duration:1,title:'Gym',category:'health',mode:'plan' },
  { id:'p10',day:2,start:9,duration:3,title:'Build dashboard',category:'deep',mode:'plan' },
  { id:'p11',day:2,start:14,duration:1,title:'Client sync',category:'meetings',mode:'plan' },
  { id:'p12',day:3,start:8.5,duration:2,title:'Research sprint',category:'deep',mode:'plan' },
  { id:'p13',day:3,start:11,duration:1,title:'Project check-in',category:'meetings',mode:'plan' },
  { id:'p14',day:3,start:16,duration:1.5,title:'Course module',category:'learning',mode:'plan' },
  { id:'p15',day:4,start:7.5,duration:1,title:'Morning run',category:'health',mode:'plan' },
  { id:'p16',day:4,start:9,duration:3,title:'Finish proposal',category:'deep',mode:'plan' },
  { id:'p17',day:4,start:14,duration:1,title:'Weekly review',category:'personal',mode:'plan' },
  { id:'p18',day:5,start:9,duration:1.5,title:'Long walk',category:'health',mode:'plan' },
  { id:'p19',day:5,start:12,duration:2,title:'Family lunch',category:'personal',mode:'plan' },
  { id:'p20',day:6,start:9.5,duration:1.5,title:'Weekly reset',category:'personal',mode:'plan' },
  { id:'p21',day:6,start:16,duration:2,title:'Learn TypeScript',category:'learning',mode:'plan' },
  { id:'a1',day:0,start:7.5,duration:.75,title:'Morning run',category:'health',mode:'actual' },
  { id:'a2',day:0,start:9.25,duration:2,title:'Product strategy',category:'deep',mode:'actual' },
  { id:'a3',day:0,start:15.25,duration:1.5,title:'Design review',category:'meetings',mode:'actual' },
  { id:'a4',day:1,start:8,duration:1.25,title:'Weekly planning',category:'deep',mode:'actual' },
  { id:'a5',day:1,start:10.25,duration:.75,title:'Team stand-up',category:'meetings',mode:'actual' },
  { id:'a6',day:1,start:12,duration:2,title:'Focus: prototype',category:'deep',mode:'actual' },
  { id:'a7',day:2,start:7.25,duration:.75,title:'Gym',category:'health',mode:'actual' },
  { id:'a8',day:2,start:9,duration:2.5,title:'Build dashboard',category:'deep',mode:'actual' },
  { id:'a9',day:2,start:14.25,duration:1,title:'Client sync',category:'meetings',mode:'actual' },
  { id:'a10',day:3,start:9,duration:1.5,title:'Research sprint',category:'deep',mode:'actual' },
  { id:'a11',day:3,start:11,duration:1,title:'Project check-in',category:'meetings',mode:'actual' },
  { id:'a12',day:4,start:7.5,duration:.75,title:'Morning run',category:'health',mode:'actual' },
]

const fmt = (n:number) => {
  const h = Math.floor(n), m = Math.round((n-h)*60)
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function Home() {
  const [mode,setMode] = useState<Mode>('plan')
  const [blocks,setBlocks] = useState<Block[]>(seed)
  const [selected,setSelected] = useState<Block|null>(null)
  const [insights,setInsights] = useState(true)
  const [sidebar,setSidebar] = useState(true)
  const [compact,setCompact] = useState(false)
  const [filters,setFilters] = useState<string[]>(categories.map(c=>c.id))
  const [toast,setToast] = useState('')
  const [sleep,setSleep] = useState(23)
  const [loaded,setLoaded] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(()=>{
    try { const saved=localStorage.getItem('tempo-blocks'); if(saved) setBlocks(JSON.parse(saved)) } catch {}
    setLoaded(true)
  },[])
  useEffect(()=>{ if(loaded) localStorage.setItem('tempo-blocks',JSON.stringify(blocks)) },[blocks,loaded])
  useEffect(()=>{ if(toast){ const t=setTimeout(()=>setToast(''),2200); return()=>clearTimeout(t)} },[toast])

  const visible = blocks.filter(b=>b.mode===mode && filters.includes(b.category))
  const planned = blocks.filter(b=>b.mode==='plan')
  const actual = blocks.filter(b=>b.mode==='actual')
  const hours = Array.from({length:END-START},(_,i)=>i+START)
  const analytics = useMemo(()=>categories.map(c=>({
    ...c,
    planned: planned.filter(b=>b.category===c.id).reduce((a,b)=>a+b.duration,0),
    actual: actual.filter(b=>b.category===c.id).reduce((a,b)=>a+b.duration,0)
  })).filter(x=>x.planned||x.actual),[blocks])
  const plannedTotal=analytics.reduce((a,b)=>a+b.planned,0)
  const actualTotal=analytics.reduce((a,b)=>a+b.actual,0)
  const available=(sleep-START)*7

  function addAt(day:number,start:number){
    const block:Block={id:crypto.randomUUID(),day,start:Math.max(START,Math.min(sleep-1,start)),duration:1,title:'New time block',category:'deep',mode}
    setBlocks(v=>[...v,block]); setSelected(block)
  }
  function onGridClick(e:React.MouseEvent,day:number){
    if((e.target as HTMLElement).closest('.event')) return
    const rect=(e.currentTarget as HTMLElement).getBoundingClientRect()
    const start=Math.round((START+(e.clientY-rect.top)/HOUR)*4)/4
    addAt(day,start)
  }
  function moveBlock(e:React.DragEvent,day:number){
    e.preventDefault(); const id=e.dataTransfer.getData('text/block'); if(!id)return
    const rect=(e.currentTarget as HTMLElement).getBoundingClientRect()
    const start=Math.round((START+(e.clientY-rect.top)/HOUR)*4)/4
    setBlocks(v=>v.map(b=>b.id===id?{...b,day,start:Math.max(START,Math.min(sleep-b.duration,start))}:b))
  }
  function updateBlock(next:Block){ setBlocks(v=>v.map(b=>b.id===next.id?next:b)); setSelected(next) }
  function copyPlan(){
    const ids=new Set(actual.map(b=>`${b.day}-${b.title}`))
    const copies=planned.filter(b=>!ids.has(`${b.day}-${b.title}`)).map(b=>({...b,id:crypto.randomUUID(),mode:'actual' as Mode}))
    setBlocks(v=>[...v,...copies]); setToast(`${copies.length} planned blocks copied to Actual`)
  }

  return <main className={compact?'compact':''}>
    <header>
      <div className="brand"><button className="iconbtn" onClick={()=>setSidebar(v=>!v)} aria-label="Toggle sidebar"><Menu size={19}/></button><div className="mark"><Clock3 size={17}/></div><span>tempo</span></div>
      <nav className="mode-switch" aria-label="Calendar mode">
        <button className={mode==='plan'?'active':''} onClick={()=>setMode('plan')}><Target size={15}/>Plan</button>
        <button className={mode==='actual'?'active actual':''} onClick={()=>setMode('actual')}><Check size={15}/>Actual</button>
      </nav>
      <div className="header-actions"><button className="iconbtn"><Search size={18}/></button><button className="iconbtn"><Bell size={18}/><i/></button><div className="avatar">TK</div></div>
    </header>
    <div className="app-shell">
      {sidebar && <aside className="sidebar">
        <button className="new-block" onClick={()=>addAt(0,9)}><Plus size={18}/> New time block <span>N</span></button>
        <section className="mini-cal"><div className="mini-head"><b>July 2026</b><span><ChevronLeft size={15}/><ChevronRight size={15}/></span></div><div className="mini-grid">{DAYS.map(d=><small key={d}>{d[0]}</small>)}{Array.from({length:5},(_,i)=><em key={'x'+i}></em>)}{Array.from({length:31},(_,i)=><button className={i+1===11?'today':i+1>=6&&i+1<=12?'week':''} key={i}>{i+1}</button>)}</div></section>
        <section className="side-section"><div className="section-title"><span>CALENDARS</span><Plus size={14}/></div>{categories.map(c=><label className="calendar-row" key={c.id}><button className={`check ${filters.includes(c.id)?'on':''}`} style={{'--c':c.color} as React.CSSProperties} onClick={()=>setFilters(v=>v.includes(c.id)?v.filter(x=>x!==c.id):[...v,c.id])}>{filters.includes(c.id)&&<Check size={11}/>}</button><span>{c.name}</span><small>{c.icon}</small></label>)}</section>
        <section className="side-section settings"><div className="section-title"><span>DAY BOUNDS</span></div><label><span>Wake</span><select defaultValue="6"><option>5</option><option>6</option><option>7</option><option>8</option></select></label><label><span>Sleep</span><select value={sleep} onChange={e=>setSleep(+e.target.value)}><option>21</option><option>22</option><option>23</option><option>24</option></select></label></section>
        <div className="side-footer"><button><Settings2 size={16}/>Preferences</button><button><CircleHelp size={16}/>Help & shortcuts</button></div>
      </aside>}
      <section className="workspace">
        <div className="toolbar">
          <div><h1>July <span>6–12</span></h1><p>{mode==='plan'?'Shape the week before it shapes you.':'Log what happened. Your plan stays visible underneath.'}</p></div>
          <div className="toolbar-actions">{mode==='actual'&&<button className="copy-plan" onClick={copyPlan}><Sparkles size={15}/>Fill from plan</button>}<button className="today-btn">Today</button><button className="week-btn">Week <ChevronDown size={14}/></button><span className="pager"><button><ChevronLeft size={17}/></button><button><ChevronRight size={17}/></button></span><button className={`insights-toggle ${insights?'on':''}`} onClick={()=>setInsights(v=>!v)}><BarChart3 size={17}/></button></div>
        </div>
        {mode==='actual'&&<div className="actual-banner"><span><Check size={14}/>Actual mode</span> Planned blocks appear as a faint guide. Add or adjust blocks to reflect what really happened.</div>}
        <div className="calendar-wrap">
          <div className="calendar" ref={gridRef}>
            <div className="day-head time-head"><span>GMT+5:30</span></div>{DAYS.map((d,i)=><div className={`day-head ${i===5?'is-today':''}`} key={d}><span>{d}</span><b>{DATES[i]}</b>{i===5&&<small>Today</small>}</div>)}
            <div className="time-axis">{hours.map(h=><span key={h} style={{top:(h-START)*HOUR-7}}>{fmt(h).replace(':00','')}</span>)}</div>
            {DAYS.map((d,day)=><div className={`day-column ${day===5?'today-col':''}`} key={d} style={{height:(END-START)*HOUR}} onClick={e=>onGridClick(e,day)} onDragOver={e=>e.preventDefault()} onDrop={e=>moveBlock(e,day)}>
              {hours.map(h=><div className="hour-line" key={h} style={{top:(h-START)*HOUR}}/>)}
              {mode==='actual'&&planned.filter(b=>b.day===day&&filters.includes(b.category)).map(b=><Ghost key={b.id} b={b}/>)}
              {visible.filter(b=>b.day===day).map(b=><Event key={b.id} b={b} onSelect={()=>setSelected(b)}/>) }
            </div>)}
          </div>
        </div>
      </section>
      {insights&&<aside className="insights">
        <div className="insights-head"><div><span>WEEKLY PULSE</span><h2>Allocation</h2></div><button className="iconbtn" onClick={()=>setInsights(false)}><X size={17}/></button></div>
        <div className="score-card"><div className="ring" style={{'--p':`${Math.min(100,(mode==='plan'?plannedTotal:actualTotal)/available*100)}%`} as React.CSSProperties}><div><b>{Math.round((mode==='plan'?plannedTotal:actualTotal)*10)/10}h</b><span>blocked</span></div></div><div><b>{Math.round((mode==='plan'?plannedTotal:actualTotal)/available*100)}%</b><span>of waking hours</span><small>{Math.round((available-(mode==='plan'?plannedTotal:actualTotal))*10)/10}h unallocated</small></div></div>
        <div className="metric-row"><div><Clock3 size={16}/><span><b>{mode==='plan'?plannedTotal:actualTotal}h</b>Focused</span></div><div><LayoutGrid size={16}/><span><b>{visible.length}</b>Blocks</span></div></div>
        <section className="allocation"><div className="allocation-title"><h3>By calendar</h3><span>{mode==='plan'?'Planned':'Actual'}</span></div>{analytics.map(a=>{const v=mode==='plan'?a.planned:a.actual;return <div className="bar-row" key={a.id}><div><span><i style={{background:a.color}}/>{a.name}</span><b>{v}h</b></div><div className="bar"><i style={{width:`${Math.min(100,v/Math.max(1,...analytics.map(x=>mode==='plan'?x.planned:x.actual))*100)}%`,background:a.color}}/></div>{mode==='actual'&&<small className={a.actual>=a.planned?'good':''}>{a.actual-a.planned>=0?'+':''}{Math.round((a.actual-a.planned)*10)/10}h vs plan</small>}</div>})}</section>
        <section className="daily-chart"><div className="allocation-title"><h3>Daily load</h3><span>hours</span></div><div className="bars">{DAYS.map((d,i)=>{const val=(mode==='plan'?planned:actual).filter(b=>b.day===i).reduce((a,b)=>a+b.duration,0);return <div key={d}><span style={{height:`${Math.max(5,val/7*100)}%`}}/><small>{d[0]}</small></div>})}</div></section>
        <div className="nudge"><Sparkles size={16}/><div><b>{mode==='plan'?'Keep some white space':'You’re tracking well'}</b><p>{mode==='plan'?`${Math.round(available-plannedTotal)} hours remain open for rest, routines and the unexpected.`:`${Math.round(actualTotal/plannedTotal*100)}% of planned time has been logged so far.`}</p></div></div>
      </aside>}
    </div>
    {selected&&<Editor block={selected} onChange={updateBlock} onClose={()=>setSelected(null)} onDelete={()=>{setBlocks(v=>v.filter(b=>b.id!==selected.id));setSelected(null);setToast('Block deleted')}}/>}
    {toast&&<div className="toast"><Check size={16}/>{toast}</div>}
  </main>
}

function Event({b,onSelect}:{b:Block,onSelect:()=>void}){
  const cat=categories.find(c=>c.id===b.category)!
  return <button draggable onDragStart={e=>{e.dataTransfer.setData('text/block',b.id);e.dataTransfer.effectAllowed='move'}} onClick={e=>{e.stopPropagation();onSelect()}} className="event" style={{top:(b.start-START)*HOUR+2,height:Math.max(28,b.duration*HOUR-4),'--event':cat.color} as React.CSSProperties}><GripVertical size={12}/><b>{b.title}</b>{b.duration>=.75&&<span>{fmt(b.start)} – {fmt(b.start+b.duration)}</span>}</button>
}
function Ghost({b}:{b:Block}){const cat=categories.find(c=>c.id===b.category)!;return <div className="event ghost" style={{top:(b.start-START)*HOUR+2,height:Math.max(28,b.duration*HOUR-4),'--event':cat.color} as React.CSSProperties}><b>{b.title}</b></div>}

function Editor({block,onChange,onClose,onDelete}:{block:Block,onChange:(b:Block)=>void,onClose:()=>void,onDelete:()=>void}){
  const [draft,setDraft]=useState(block)
  const save=()=>{onChange(draft);onClose()}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="editor"><div className="editor-head"><span>Edit time block</span><button className="iconbtn" onClick={onClose}><X size={18}/></button></div><input className="title-input" autoFocus value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/><div className="form-row"><label><span>Day</span><select value={draft.day} onChange={e=>setDraft({...draft,day:+e.target.value})}>{DAYS.map((d,i)=><option value={i} key={d}>{d}, July {DATES[i]}</option>)}</select></label><label><span>Starts</span><input type="time" value={`${String(Math.floor(draft.start)).padStart(2,'0')}:${String(Math.round((draft.start%1)*60)).padStart(2,'0')}`} onChange={e=>{const [h,m]=e.target.value.split(':').map(Number);setDraft({...draft,start:h+m/60})}}/></label></div><label className="wide-label"><span>Duration</span><div className="duration-options">{[.5,.75,1,1.5,2,3].map(n=><button className={draft.duration===n?'active':''} onClick={()=>setDraft({...draft,duration:n})} key={n}>{n<1?n*60+'m':n+'h'}</button>)}</div></label><label className="wide-label"><span>Calendar</span><div className="cat-options">{categories.map(c=><button className={draft.category===c.id?'active':''} style={{'--c':c.color} as React.CSSProperties} onClick={()=>setDraft({...draft,category:c.id})} key={c.id}><i/>{c.name}</button>)}</div></label><div className="editor-footer"><button className="delete" onClick={onDelete}>Delete</button><span><button className="cancel" onClick={onClose}>Cancel</button><button className="save" onClick={save}>Save block</button></span></div></div></div>
}
