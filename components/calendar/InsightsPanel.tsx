import { BarChart3, CircleGauge, Clock3, X } from 'lucide-react'
import { toISO } from '@/lib/calendar/date'
import type { CalendarBlock, CalendarCategory, CalendarSettings, Layer } from '@/lib/calendar/types'

type Props={blocks:CalendarBlock[];categories:CalendarCategory[];settings:CalendarSettings;dates:Date[];layer:Layer;onClose?:()=>void}

function uniqueHours(blocks:CalendarBlock[],settings:CalendarSettings){
  const byDate=new Map<string,[number,number][]>();blocks.forEach(b=>{const start=Math.max(settings.wakeHour,b.start),end=Math.min(settings.sleepHour,b.end);if(end>start)byDate.set(b.date,[...(byDate.get(b.date)??[]),[start,end]])})
  let total=0;byDate.forEach(ranges=>{ranges.sort((a,b)=>a[0]-b[0]);let [s,e]=ranges[0]??[0,0];for(const [ns,ne] of ranges.slice(1)){if(ns<=e)e=Math.max(e,ne);else{total+=e-s;s=ns;e=ne}}total+=e-s});return total
}

export function InsightsPanel({blocks,categories,settings,dates,layer,onClose}:Props){
  const dateSet=new Set(dates.map(toISO));const scoped=blocks.filter(b=>b.layer===layer&&dateSet.has(b.date)&&!b.allDay);const plan=blocks.filter(b=>b.layer==='plan'&&dateSet.has(b.date)&&!b.allDay);const actual=blocks.filter(b=>b.layer==='actual'&&dateSet.has(b.date)&&!b.allDay)
  const allocated=uniqueHours(scoped,settings),available=(settings.sleepHour-settings.wakeHour)*dates.length,unallocated=Math.max(0,available-allocated)
  const perCategory=categories.map(c=>({c,plan:uniqueHours(plan.filter(b=>b.categoryId===c.id),settings),actual:uniqueHours(actual.filter(b=>b.categoryId===c.id),settings)}))
  const max=Math.max(1,...perCategory.map(x=>layer==='plan'?x.plan:x.actual))
  const ringValues=perCategory.map(x=>({color:x.c.color,value:layer==='plan'?x.plan:x.actual})).filter(x=>x.value>0),ringTotal=ringValues.reduce((sum,x)=>sum+x.value,0);let cursor=0;const ringGradient=`conic-gradient(${ringValues.map(x=>{const start=cursor/ringTotal*100;cursor+=x.value;return `${x.color} ${start}% ${cursor/ringTotal*100}%`}).join(',')||'#2a2b2f 0 100%'})`
  return <aside className="context-panel insights-panel"><div className="panel-head"><span><BarChart3 size={15}/>Weekly insights</span>{onClose&&<button className="quiet-icon" aria-label="Close insights" onClick={onClose}><X size={16}/></button>}</div><div className="insights-body">
    <div className="allocation-hero"><div className="allocation-ring segmented" style={{background:ringGradient}}><span><b>{allocated.toFixed(1)}h</b><small>blocked</small></span></div><div><strong>{Math.round(allocated/available*100)}%</strong><span>of waking hours</span><small>{unallocated.toFixed(1)}h unallocated</small></div></div>
    <div className="insight-metrics"><div><Clock3 size={15}/><span><b>{scoped.length}</b> blocks</span></div><div><CircleGauge size={15}/><span><b>{scoped.filter(b=>b.end-b.start<1).length}</b> short</span></div></div>
    <section className="insight-section"><header><h3>By calendar</h3><span>{layer==='plan'?'Plan':'Actual vs plan'}</span></header>{perCategory.map(({c,plan,actual})=>{const value=layer==='plan'?plan:actual,events=scoped.filter(b=>b.categoryId===c.id).sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start),durationTotal=events.reduce((sum,b)=>sum+b.end-b.start,0);return <div className="allocation-row" key={c.id}><div><span><i style={{background:c.color}}/>{c.name}</span><span className="allocation-values">{layer==='actual'&&<small className={actual>=plan?'positive':''}>{actual-plan>=0?'+':''}{(actual-plan).toFixed(1)}h vs plan</small>}<b>{value.toFixed(1)}h</b></span></div><div className="allocation-track"><span className="allocation-fill" style={{width:`${value/max*100}%`}}>{events.map(b=><i key={b.id} style={{background:c.color,width:`${(b.end-b.start)/Math.max(durationTotal,.01)*100}%`}} title={b.title}/>)}</span></div></div>})}</section>
    <section className="insight-section"><header><h3>Daily load</h3><span>unique hours</span></header><div className="daily-bars stacked">{dates.map(d=>{const dayBlocks=scoped.filter(b=>b.date===toISO(d)),parts=categories.map(c=>({c,value:uniqueHours(dayBlocks.filter(b=>b.categoryId===c.id),settings)})).filter(x=>x.value>0),total=parts.reduce((sum,x)=>sum+x.value,0);return <div key={toISO(d)}><span><span className="stacked-column" style={{height:`${Math.max(3,total/(settings.sleepHour-settings.wakeHour)*100)}%`}}>{parts.map(x=><i key={x.c.id} style={{background:x.c.color,height:`${x.value/Math.max(total,.01)*100}%`}} title={`${x.c.name}: ${x.value.toFixed(1)}h`}/>)}</span></span><small>{d.toLocaleString('en',{weekday:'narrow'})}</small></div>})}</div></section>
    <div className="insight-note"><b>{unallocated>available*.45?'Plenty of breathing room':'A full week'}</b><p>{unallocated.toFixed(1)} hours remain open between your configured wake and sleep times. Overlapping blocks are counted once.</p></div>
  </div></aside>
}
