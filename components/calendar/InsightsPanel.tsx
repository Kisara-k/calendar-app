'use client'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BarChart3, CircleGauge, Clock3, X } from 'lucide-react'
import { formatTime, fromISO, toISO } from '@/lib/calendar/date'
import type { CalendarBlock, CalendarCategory, CalendarSettings, Layer } from '@/lib/calendar/types'

type TipLine={text:string;hi?:boolean;mid?:string;right?:string}
type TipData={title?:string;timeRight?:string;color?:string;lines:TipLine[]}
type Tip=TipData&{below:boolean;cx:number;anchorTop:number;anchorBottom:number}

type Props={blocks:CalendarBlock[];categories:CalendarCategory[];settings:CalendarSettings;dates:Date[];layer:Layer;onClose?:()=>void}

function uniqueHours(blocks:CalendarBlock[],settings:CalendarSettings){
  const byDate=new Map<string,[number,number][]>();blocks.forEach(b=>{const start=Math.max(settings.wakeHour,b.start),end=Math.min(settings.sleepHour,b.end);if(end>start)byDate.set(b.date,[...(byDate.get(b.date)??[]),[start,end]])})
  let total=0;byDate.forEach(ranges=>{ranges.sort((a,b)=>a[0]-b[0]);let [s,e]=ranges[0]??[0,0];for(const [ns,ne] of ranges.slice(1)){if(ns<=e)e=Math.max(e,ne);else{total+=e-s;s=ns;e=ne}}total+=e-s});return total
}

function fmtDate(iso:string){const d=fromISO(iso);return d.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'})}
function fmtDur(h:number){const m=Math.round(h*60);return m<60?`${m} min`:`${+(h.toFixed(1))} h`}
function fmtH(h:number){const m=Math.round(h*60);return m<60?`${m}m`:`${+(h.toFixed(1))}h`}
function polar(cx:number,cy:number,r:number,deg:number):[number,number]{const a=(deg-90)*Math.PI/180;return[cx+r*Math.cos(a),cy+r*Math.sin(a)]}
function sectorArc(cx:number,cy:number,r:number,inner:number,s:number,e:number){if(e-s<0.5)return '';const[x1,y1]=polar(cx,cy,r,s),[x2,y2]=polar(cx,cy,r,e),[x3,y3]=polar(cx,cy,inner,e),[x4,y4]=polar(cx,cy,inner,s);const la=e-s>180?1:0;return `M${x1},${y1}A${r},${r},0,${la},1,${x2},${y2}L${x3},${y3}A${inner},${inner},0,${la},0,${x4},${y4}Z`}

export function InsightsPanel({blocks,categories,settings,dates,layer,onClose}:Props){
  const [tip,setTip]=useState<Tip|null>(null)
  const hideTimer=useRef<ReturnType<typeof setTimeout>|null>(null)

  function makeTip(rect:{left:number;right:number;top:number;bottom:number;width:number;height:number},data:TipData){
    if(hideTimer.current)clearTimeout(hideTimer.current)
    const cx=rect.left+rect.width/2
    const spaceBelow=window.innerHeight-(rect.bottom+10)
    const below=spaceBelow>90
    setTip({...data,below,cx,anchorTop:rect.top,anchorBottom:rect.bottom})
  }
  function showTip(e:React.MouseEvent,data:TipData){const r=(e.currentTarget as Element).getBoundingClientRect();makeTip(r,data)}
  const hideTip=()=>{hideTimer.current=setTimeout(()=>setTip(null),500)}
  const cancelHide=()=>{if(hideTimer.current)clearTimeout(hideTimer.current)}

  const dateSet=new Set(dates.map(toISO));const scoped=blocks.filter(b=>b.layer===layer&&dateSet.has(b.date)&&!b.allDay);const plan=blocks.filter(b=>b.layer==='plan'&&dateSet.has(b.date)&&!b.allDay);const actual=blocks.filter(b=>b.layer==='actual'&&dateSet.has(b.date)&&!b.allDay)
  const allocated=uniqueHours(scoped,settings),available=(settings.sleepHour-settings.wakeHour)*dates.length,unallocated=Math.max(0,available-allocated)
  const perCategory=categories.map(c=>({c,plan:uniqueHours(plan.filter(b=>b.categoryId===c.id),settings),actual:uniqueHours(actual.filter(b=>b.categoryId===c.id),settings)}))
  const max=Math.max(1,...perCategory.map(x=>layer==='plan'?x.plan:x.actual))

  const ringValues=perCategory.map(x=>({color:x.c.color,value:layer==='plan'?x.plan:x.actual,cat:x.c})).filter(x=>x.value>0)
  const categoryTotal=ringValues.reduce((a,x)=>a+x.value,0),ringScale=categoryTotal?allocated/categoryTotal:0
  let rCursor=0
  const ringSegs=ringValues.map(x=>{const startDeg=rCursor/available*360;rCursor+=x.value*ringScale;const endDeg=rCursor/available*360;return {...x,startDeg,endDeg}})
  const ringGradient=`conic-gradient(${[...ringSegs.map(x=>`${x.color} ${x.startDeg/360*100}% ${Math.min(100,x.endDeg/360*100)}%`),`#2a2b2f ${Math.min(100,allocated/available*100)}% 100%`].join(',')})`

  return <aside className="context-panel insights-panel"><div className="panel-head"><span><BarChart3 size={15}/>Weekly insights</span>{onClose&&<button className="quiet-icon" aria-label="Close insights" onClick={onClose}><X size={16}/></button>}</div><div className="insights-body">
    <div className="allocation-hero">
      <div className="allocation-ring segmented" style={{background:ringGradient}}>
        <span style={{zIndex:1,position:'relative'}}><b>{allocated.toFixed(1)}h</b><small>blocked</small></span>
        <svg style={{position:'absolute',inset:0,borderRadius:'50%',zIndex:2,overflow:'visible'}} viewBox="0 0 68 68">
          {ringSegs.map((x,i)=>{
            const dayLines:TipLine[]=dates.flatMap(d=>{const iso=toISO(d);const catEvts=scoped.filter(b=>b.categoryId===x.cat.id&&b.date===iso).sort((a,b)=>a.start-b.start);if(!catEvts.length)return [];return [{text:fmtDate(iso)},...catEvts.map(b=>({text:b.title||'Untitled',hi:true,mid:formatTime(b.start,settings.timeFormat),right:fmtH(b.end-b.start)}))]})
            return <path key={i} d={sectorArc(34,34,34,28,x.startDeg,x.endDeg)} fill="transparent" style={{pointerEvents:'all',cursor:'default'}} onMouseEnter={e=>{const r=(e.currentTarget as SVGPathElement).getBoundingClientRect();makeTip(r,{title:x.cat.name,timeRight:`${x.value.toFixed(1)} h`,color:x.color,lines:dayLines})}} onMouseLeave={hideTip}/>
          })}
        </svg>
      </div>
      <div><strong>{Math.round(allocated/available*100)}%</strong><span>of waking hours</span><small>{unallocated.toFixed(1)}h unallocated</small></div>
    </div>
    <div className="insight-metrics"><div><Clock3 size={15}/><span><b>{scoped.length}</b> blocks</span></div><div><CircleGauge size={15}/><span><b>{scoped.filter(b=>b.end-b.start<1).length}</b> short</span></div></div>
    <section className="insight-section"><header><h3>By calendar</h3><span>{layer==='plan'?'Plan':'Actual vs plan'}</span></header>{perCategory.map(({c,plan,actual})=>{const value=layer==='plan'?plan:actual,events=scoped.filter(b=>b.categoryId===c.id).sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start),durationTotal=events.reduce((sum,b)=>sum+b.end-b.start,0);return <div className="allocation-row" key={c.id}><div><span><i style={{background:c.color}}/>{c.name}</span><span className="allocation-values">{layer==='actual'&&<small className={actual>=plan?'positive':''}>{actual-plan>=0?'+':''}{(actual-plan).toFixed(1)}h vs plan</small>}<b>{value.toFixed(1)}h</b></span></div><div className="allocation-track"><span className="allocation-fill" style={{width:`${value/max*100}%`}}>{events.map(b=><i key={b.id} style={{background:c.color,width:`${(b.end-b.start)/Math.max(durationTotal,.01)*100}%`,cursor:'default'}} onMouseEnter={e=>showTip(e,{title:b.title||'Untitled',timeRight:fmtDur(b.end-b.start),color:c.color,lines:[{text:fmtDate(b.date)},{text:formatTime(b.start,settings.timeFormat)},...(b.notes?.trim()?[{text:b.notes.trim()}]:[])]})} onMouseLeave={hideTip}/>)}</span></div></div>})}</section>
    <section className="insight-section"><header><h3>Daily load</h3><span>unique hours</span></header><div className="daily-bars stacked">{dates.map(d=>{const iso=toISO(d);const dayBlocks=scoped.filter(b=>b.date===iso),parts=categories.map(c=>({c,value:uniqueHours(dayBlocks.filter(b=>b.categoryId===c.id),settings)})).filter(x=>x.value>0),total=parts.reduce((s,x)=>s+x.value,0);const dayLabel=d.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'});return <div key={iso}><span><span className="stacked-column" style={{height:`${Math.max(3,total/(settings.sleepHour-settings.wakeHour)*100)}%`}}>{parts.map(x=>{const catEvents=scoped.filter(b=>b.categoryId===x.c.id&&b.date===iso).sort((a,b)=>a.start-b.start);const lines:TipLine[]=[{text:dayLabel},...catEvents.map(b=>({text:b.title||'Untitled',hi:true,mid:formatTime(b.start,settings.timeFormat),right:fmtH(b.end-b.start)}))];return <i key={x.c.id} style={{background:x.c.color,height:`${x.value/Math.max(total,.01)*100}%`,cursor:'default'}} onMouseEnter={e=>showTip(e,{title:x.c.name,timeRight:`${x.value.toFixed(1)} h`,color:x.c.color,lines})} onMouseLeave={hideTip}/>})}</span></span><small>{d.toLocaleString('en',{weekday:'narrow'})}</small></div>})}</div></section>
    <div className="insight-note"><b>{unallocated>available*.45?'Plenty of breathing room':'A full week'}</b><p>{unallocated.toFixed(1)} hours remain open between your configured wake and sleep times. Overlapping blocks are counted once.</p></div>
  </div>
  {tip&&createPortal((()=>{const half=130;const clampedCx=Math.min(Math.max(tip.cx,half+8),window.innerWidth-half-8);const arrowPct=Math.min(90,Math.max(10,(tip.cx-clampedCx+half)/(half*2)*100));return <div className={`insights-tip ${tip.below?'tip-below':'tip-above'}`} style={{left:clampedCx,top:tip.below?tip.anchorBottom+10:tip.anchorTop-10,'--tip-color':tip.color??'#e0e1e3','--arrow-x':`${arrowPct}%`} as React.CSSProperties} onMouseEnter={cancelHide} onMouseLeave={hideTip}>{tip.title&&<div className="tip-head"><b>{tip.title}</b>{tip.timeRight&&<span className="tip-right">{tip.timeRight}</span>}</div>}{tip.lines.map((l,i)=><span key={i} className="tip-line"><span className="tip-left"><span className={l.hi?'tip-hi':''}>{l.text}</span>{l.mid&&<span className="tip-mid"> {l.mid}</span>}</span>{l.right&&<span className="tip-lr">{l.right}</span>}</span>)}</div>})(),document.body)}
  </aside>
}
