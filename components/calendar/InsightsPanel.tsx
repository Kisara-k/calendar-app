'use client'
import { useRef, useState } from 'react'
import { BarChart3, CircleGauge, Clock3, X } from 'lucide-react'
import { formatTime, fromISO, toISO } from '@/lib/calendar/date'
import type { CalendarBlock, CalendarCategory, CalendarSettings, Layer } from '@/lib/calendar/types'

type Tip={x:number;y:number;title?:string;color?:string;lines:string[]}

type Props={blocks:CalendarBlock[];categories:CalendarCategory[];settings:CalendarSettings;dates:Date[];layer:Layer;onClose?:()=>void}

function uniqueHours(blocks:CalendarBlock[],settings:CalendarSettings){
  const byDate=new Map<string,[number,number][]>();blocks.forEach(b=>{const start=Math.max(settings.wakeHour,b.start),end=Math.min(settings.sleepHour,b.end);if(end>start)byDate.set(b.date,[...(byDate.get(b.date)??[]),[start,end]])})
  let total=0;byDate.forEach(ranges=>{ranges.sort((a,b)=>a[0]-b[0]);let [s,e]=ranges[0]??[0,0];for(const [ns,ne] of ranges.slice(1)){if(ns<=e)e=Math.max(e,ne);else{total+=e-s;s=ns;e=ne}}total+=e-s});return total
}

function fmtDate(iso:string){const d=fromISO(iso);return d.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'})}
function fmtDur(h:number){const m=Math.round(h*60);return m<60?`${m} min`:`${+(h.toFixed(1))} h`}

export function InsightsPanel({blocks,categories,settings,dates,layer,onClose}:Props){
  const [tip,setTip]=useState<Tip|null>(null)
  const hideTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const showTip=(e:React.MouseEvent,t:Omit<Tip,'x'|'y'>)=>{if(hideTimer.current)clearTimeout(hideTimer.current);setTip({...t,x:e.clientX,y:e.clientY})}
  const moveTip=(e:React.MouseEvent)=>{if(hideTimer.current)clearTimeout(hideTimer.current);setTip(v=>v?{...v,x:e.clientX,y:e.clientY}:null)}
  const hideTip=()=>{hideTimer.current=setTimeout(()=>setTip(null),160)}
  const dateSet=new Set(dates.map(toISO));const scoped=blocks.filter(b=>b.layer===layer&&dateSet.has(b.date)&&!b.allDay);const plan=blocks.filter(b=>b.layer==='plan'&&dateSet.has(b.date)&&!b.allDay);const actual=blocks.filter(b=>b.layer==='actual'&&dateSet.has(b.date)&&!b.allDay)
  const allocated=uniqueHours(scoped,settings),available=(settings.sleepHour-settings.wakeHour)*dates.length,unallocated=Math.max(0,available-allocated)
  const perCategory=categories.map(c=>({c,plan:uniqueHours(plan.filter(b=>b.categoryId===c.id),settings),actual:uniqueHours(actual.filter(b=>b.categoryId===c.id),settings)}))
  const max=Math.max(1,...perCategory.map(x=>layer==='plan'?x.plan:x.actual))
  const ringValues=perCategory.map(x=>({color:x.c.color,value:layer==='plan'?x.plan:x.actual})).filter(x=>x.value>0),categoryTotal=ringValues.reduce((sum,x)=>sum+x.value,0),ringScale=categoryTotal?allocated/categoryTotal:0;let cursor=0;const ringStops=ringValues.map(x=>{const start=cursor/available*100;cursor+=x.value*ringScale;return `${x.color} ${start}% ${Math.min(100,cursor/available*100)}%`});const ringGradient=`conic-gradient(${[...ringStops,`#2a2b2f ${Math.min(100,allocated/available*100)}% 100%`].join(',')})`
  return <aside className="context-panel insights-panel" onMouseLeave={hideTip}><div className="panel-head"><span><BarChart3 size={15}/>Weekly insights</span>{onClose&&<button className="quiet-icon" aria-label="Close insights" onClick={onClose}><X size={16}/></button>}</div><div className="insights-body">
    <div className="allocation-hero"><div className="allocation-ring segmented" style={{background:ringGradient}}><span><b>{allocated.toFixed(1)}h</b><small>blocked</small></span></div><div><strong>{Math.round(allocated/available*100)}%</strong><span>of waking hours</span><small>{unallocated.toFixed(1)}h unallocated</small></div></div>
    <div className="insight-metrics"><div><Clock3 size={15}/><span><b>{scoped.length}</b> blocks</span></div><div><CircleGauge size={15}/><span><b>{scoped.filter(b=>b.end-b.start<1).length}</b> short</span></div></div>
    <section className="insight-section"><header><h3>By calendar</h3><span>{layer==='plan'?'Plan':'Actual vs plan'}</span></header>{perCategory.map(({c,plan,actual})=>{const value=layer==='plan'?plan:actual,events=scoped.filter(b=>b.categoryId===c.id).sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start),durationTotal=events.reduce((sum,b)=>sum+b.end-b.start,0);return <div className="allocation-row" key={c.id}><div><span><i style={{background:c.color}}/>{c.name}</span><span className="allocation-values">{layer==='actual'&&<small className={actual>=plan?'positive':''}>{actual-plan>=0?'+':''}{(actual-plan).toFixed(1)}h vs plan</small>}<b>{value.toFixed(1)}h</b></span></div><div className="allocation-track"><span className="allocation-fill" style={{width:`${value/max*100}%`}}>{events.map(b=><i key={b.id} style={{background:c.color,width:`${(b.end-b.start)/Math.max(durationTotal,.01)*100}%`,cursor:'default'}} onMouseEnter={e=>showTip(e,{title:b.title||'Untitled',color:c.color,lines:[fmtDate(b.date),`${formatTime(b.start,settings.timeFormat)} – ${formatTime(b.end,settings.timeFormat)}`,fmtDur(b.end-b.start)]})} onMouseMove={moveTip} onMouseLeave={hideTip}/>)}</span></div></div>})}</section>
    <section className="insight-section"><header><h3>Daily load</h3><span>unique hours</span></header><div className="daily-bars stacked">{dates.map(d=>{const dayBlocks=scoped.filter(b=>b.date===toISO(d)),parts=categories.map(c=>({c,value:uniqueHours(dayBlocks.filter(b=>b.categoryId===c.id),settings)})).filter(x=>x.value>0),total=parts.reduce((sum,x)=>sum+x.value,0);const dayLabel=d.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'});return <div key={toISO(d)}><span><span className="stacked-column" style={{height:`${Math.max(3,total/(settings.sleepHour-settings.wakeHour)*100)}%`}}>{parts.map(x=><i key={x.c.id} style={{background:x.c.color,height:`${x.value/Math.max(total,.01)*100}%`,cursor:'default'}} onMouseEnter={e=>showTip(e,{title:x.c.name,color:x.c.color,lines:[dayLabel,`${x.value.toFixed(1)} h allocated`]})} onMouseMove={moveTip} onMouseLeave={hideTip}/>)}</span></span><small>{d.toLocaleString('en',{weekday:'narrow'})}</small></div>})}</div></section>
    <div className="insight-note"><b>{unallocated>available*.45?'Plenty of breathing room':'A full week'}</b><p>{unallocated.toFixed(1)} hours remain open between your configured wake and sleep times. Overlapping blocks are counted once.</p></div>
  </div>{tip&&<div className="insights-tip" style={{left:tip.x,top:tip.y,'--tip-color':tip.color??'#e8e9ea'} as React.CSSProperties}>{tip.title&&<b>{tip.title}</b>}{tip.lines.map((l,i)=><span key={i}>{l}</span>)}</div>}</aside>
}
