import { BarChart3, CircleGauge, Clock3, X } from 'lucide-react'
import { toISO } from '@/lib/calendar/date'
import type { CalendarBlock, CalendarCategory, CalendarSettings, Layer } from '@/lib/calendar/types'

type Props={blocks:CalendarBlock[];categories:CalendarCategory[];settings:CalendarSettings;dates:Date[];layer:Layer;onClose:()=>void}

function uniqueHours(blocks:CalendarBlock[],settings:CalendarSettings){
  const byDate=new Map<string,[number,number][]>();blocks.forEach(b=>{const start=Math.max(settings.wakeHour,b.start),end=Math.min(settings.sleepHour,b.end);if(end>start)byDate.set(b.date,[...(byDate.get(b.date)??[]),[start,end]])})
  let total=0;byDate.forEach(ranges=>{ranges.sort((a,b)=>a[0]-b[0]);let [s,e]=ranges[0]??[0,0];for(const [ns,ne] of ranges.slice(1)){if(ns<=e)e=Math.max(e,ne);else{total+=e-s;s=ns;e=ne}}total+=e-s});return total
}

export function InsightsPanel({blocks,categories,settings,dates,layer,onClose}:Props){
  const dateSet=new Set(dates.map(toISO));const scoped=blocks.filter(b=>b.layer===layer&&dateSet.has(b.date)&&!b.allDay);const plan=blocks.filter(b=>b.layer==='plan'&&dateSet.has(b.date)&&!b.allDay);const actual=blocks.filter(b=>b.layer==='actual'&&dateSet.has(b.date)&&!b.allDay)
  const allocated=uniqueHours(scoped,settings),available=(settings.sleepHour-settings.wakeHour)*dates.length,unallocated=Math.max(0,available-allocated)
  const perCategory=categories.map(c=>({c,plan:uniqueHours(plan.filter(b=>b.categoryId===c.id),settings),actual:uniqueHours(actual.filter(b=>b.categoryId===c.id),settings)}))
  const max=Math.max(1,...perCategory.map(x=>layer==='plan'?x.plan:x.actual))
  return <aside className="context-panel insights-panel"><div className="panel-head"><span><BarChart3 size={15}/>Weekly insights</span><button className="quiet-icon" aria-label="Close insights" onClick={onClose}><X size={16}/></button></div><div className="insights-body">
    <div className="allocation-hero"><div className="allocation-ring" style={{'--progress':`${Math.min(100,allocated/available*100)}%`} as React.CSSProperties}><span><b>{allocated.toFixed(1)}h</b><small>blocked</small></span></div><div><strong>{Math.round(allocated/available*100)}%</strong><span>of waking hours</span><small>{unallocated.toFixed(1)}h unallocated</small></div></div>
    <div className="insight-metrics"><div><Clock3 size={15}/><span><b>{scoped.length}</b> blocks</span></div><div><CircleGauge size={15}/><span><b>{scoped.filter(b=>b.end-b.start<1).length}</b> short</span></div></div>
    <section className="insight-section"><header><h3>By calendar</h3><span>{layer==='plan'?'Plan':'Actual vs plan'}</span></header>{perCategory.map(({c,plan,actual})=>{const value=layer==='plan'?plan:actual;return <div className="allocation-row" key={c.id}><div><span><i style={{background:c.color}}/>{c.name}</span><span className="allocation-values">{layer==='actual'&&<small className={actual>=plan?'positive':''}>{actual-plan>=0?'+':''}{(actual-plan).toFixed(1)}h vs plan</small>}<b>{value.toFixed(1)}h</b></span></div><div className="allocation-track"><i style={{background:c.color,width:`${value/max*100}%`}}/></div></div>})}</section>
    <section className="insight-section"><header><h3>Daily load</h3><span>unique hours</span></header><div className="daily-bars">{dates.map(d=>{const value=uniqueHours(scoped.filter(b=>b.date===toISO(d)),settings);return <div key={toISO(d)}><span><i style={{height:`${Math.max(3,value/(settings.sleepHour-settings.wakeHour)*100)}%`}}/></span><small>{d.toLocaleString('en',{weekday:'narrow'})}</small></div>})}</div></section>
    <div className="insight-note"><b>{unallocated>available*.45?'Plenty of breathing room':'A full week'}</b><p>{unallocated.toFixed(1)} hours remain open between your configured wake and sleep times. Overlapping blocks are counted once.</p></div>
  </div></aside>
}
