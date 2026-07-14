'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { DAY_NAMES } from '@/lib/calendar/constants'
import { addDays, formatTime, fromISO, snapTime, toISO } from '@/lib/calendar/date'
import type { CalendarBlock, CalendarCategory, CalendarSettings, Layer } from '@/lib/calendar/types'
import { EventCard } from './EventCard'

type Interaction =
  | {type:'create';pointerId:number;originX:number;originY:number;dateIndex:number;start:number;current:number;moved:boolean}
  | {type:'move';pointerId:number;originX:number;originY:number;block:CalendarBlock;offset:number;dateIndex:number;start:number;moved:boolean;openOnRelease:boolean}
  | {type:'resize';pointerId:number;originX:number;originY:number;block:CalendarBlock;end:number;moved:boolean}
  | {type:'select';pointerId:number;originX:number;originY:number;x1:number;y1:number;x2:number;y2:number;moved:boolean}

type Props={dates:Date[];blocks:CalendarBlock[];categories:CalendarCategory[];settings:CalendarSettings;layer:Layer;selectedIds:string[];onSelect:(id:string,additive:boolean)=>void;onSelectMany:(ids:string[])=>void;onClearSelection:()=>void;onCreate:(b:Omit<CalendarBlock,'id'>)=>CalendarBlock;onUpdate:(b:CalendarBlock,action:'move'|'resize')=>void;onUpdateMany:(b:CalendarBlock[])=>void;onOpen:(id:string)=>void;onEventContext:(id:string,x:number,y:number)=>void}

const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))

function overlapLayout(blocks:CalendarBlock[],categoryOrder:Map<string,number>){
  const result=new Map<string,{left:number;width:number}>()
  const sorted=[...blocks].sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start)||(categoryOrder.get(a.categoryId)??Number.MAX_SAFE_INTEGER)-(categoryOrder.get(b.categoryId)??Number.MAX_SAFE_INTEGER))
  const groups:CalendarBlock[][]=[]
  sorted.forEach(block=>{const group=groups.find(g=>g.some(x=>x.start<block.end&&block.start<x.end));if(group)group.push(block);else groups.push([block])})
  groups.forEach(group=>{
    const columns:CalendarBlock[][]=[]
    group.forEach(block=>{let index=columns.findIndex(col=>col.every(x=>x.end<=block.start||block.end<=x.start));if(index<0){index=columns.length;columns.push([])}columns[index].push(block)})
    columns.forEach((column,index)=>column.forEach(block=>result.set(block.id,{left:index/columns.length*100,width:100/columns.length})))
  })
  return result
}

export function WeekGrid({dates,blocks,categories,settings,layer,selectedIds,onSelect,onSelectMany,onClearSelection,onCreate,onUpdate,onUpdateMany,onOpen,onEventContext}:Props){
  const hourHeight=60*(settings.hourScale??1)
  const scrollRef=useRef<HTMLDivElement>(null)
  const columnsRef=useRef<HTMLDivElement>(null)
  const [interaction,setInteraction]=useState<Interaction|null>(null)
  const [tentativeIds,setTentativeIds]=useState<string[]>([])
  const [hoverTime,setHoverTime]=useState<{day:number;time:number}|null>(null)
  const [scrollbarWidth,setScrollbarWidth]=useState(0)
  const visibleCats=new Set(categories.filter(c=>c.visible).map(c=>c.id))
  const categoryOrder=useMemo(()=>new Map(categories.map((c,index)=>[c.id,index])),[categories])
  const currentBlocks=blocks.filter(b=>b.layer===layer&&!b.allDay&&visibleCats.has(b.categoryId)&&dates.some(d=>toISO(d)===b.date))
  const displayBlocks=currentBlocks.map(block=>{
    if(!interaction?.moved)return block
    if(interaction.type==='resize'&&interaction.block.id===block.id)return {...block,end:interaction.end}
    if(interaction.type!=='move')return block
    const movingGroup=selectedIds.includes(interaction.block.id)&&selectedIds.length>1
    if(block.id!==interaction.block.id&&(!movingGroup||!selectedIds.includes(block.id)))return block
    const originalIndex=dates.findIndex(d=>toISO(d)===interaction.block.date),dayDelta=interaction.dateIndex-originalIndex,timeDelta=interaction.start-interaction.block.start,duration=block.end-block.start
    const start=clamp(block.start+timeDelta,0,24-duration)
    return {...block,date:toISO(addDays(fromISO(block.date),dayDelta)),start,end:start+duration}
  })
  const manipulationGhosts=!interaction?.moved?[]:interaction.type==='resize'?currentBlocks.filter(b=>b.id===interaction.block.id):interaction.type==='move'?currentBlocks.filter(b=>b.id===interaction.block.id||(selectedIds.includes(interaction.block.id)&&selectedIds.length>1&&selectedIds.includes(b.id))):[]
  const ghostBlocks=layer==='actual'?blocks.filter(b=>b.layer==='plan'&&!b.allDay&&visibleCats.has(b.categoryId)&&dates.some(d=>toISO(d)===b.date)):[]
  const allDay=blocks.filter(b=>b.layer===layer&&b.allDay&&visibleCats.has(b.categoryId)&&dates.some(d=>toISO(d)===b.date))

  useLayoutEffect(()=>{const node=scrollRef.current;if(node)node.scrollTop=Math.max(0,settings.wakeHour*hourHeight)},[hourHeight,settings.wakeHour,dates.length])
  useLayoutEffect(()=>{const node=scrollRef.current;if(!node)return;const measure=()=>setScrollbarWidth(node.offsetWidth-node.clientWidth);measure();const ro=new ResizeObserver(measure);ro.observe(node);return()=>ro.disconnect()},[])

  const layouts=useMemo(()=>{
    const map=new Map<string,{left:number;width:number}>()
    dates.forEach(d=>{const date=toISO(d);overlapLayout(displayBlocks.filter(b=>b.date===date),categoryOrder).forEach((v,k)=>map.set(k,v))})
    return map
  },[displayBlocks,dates,categoryOrder])

  function point(e:React.PointerEvent){
    const rect=columnsRef.current!.getBoundingClientRect();const width=rect.width/dates.length
    const day=clamp(Math.floor((e.clientX-rect.left)/width),0,dates.length-1)
    const time=clamp(snapTime((e.clientY-rect.top)/hourHeight,settings.snapMinutes),0,24)
    return {day,time}
  }
  function beginCreate(e:React.PointerEvent){
    if(e.button!==0||!columnsRef.current)return
    if(e.ctrlKey||e.metaKey){(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);setInteraction({type:'select',pointerId:e.pointerId,originX:e.clientX,originY:e.clientY,x1:e.clientX,y1:e.clientY,x2:e.clientX,y2:e.clientY,moved:false});return}
    const p=point(e);(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setInteraction({type:'create',pointerId:e.pointerId,originX:e.clientX,originY:e.clientY,dateIndex:p.day,start:p.time,current:p.time,moved:false});onClearSelection()
  }
  function beginEvent(e:React.PointerEvent,kind:'move'|'resize',block:CalendarBlock){
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();columnsRef.current?.setPointerCapture(e.pointerId)
    const p=point(e)
    if(kind==='resize')onClearSelection()
    else if(e.shiftKey||e.ctrlKey||e.metaKey)onSelect(block.id,true)
    else if(!selectedIds.includes(block.id))onSelect(block.id,false)
    const inMultiSelection=selectedIds.includes(block.id)&&selectedIds.length>1
    if(kind==='move')setInteraction({type:'move',pointerId:e.pointerId,originX:e.clientX,originY:e.clientY,block,offset:p.time-block.start,dateIndex:p.day,start:block.start,moved:false,openOnRelease:!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!inMultiSelection})
    else setInteraction({type:'resize',pointerId:e.pointerId,originX:e.clientX,originY:e.clientY,block,end:block.end,moved:false})
  }
  function move(e:React.PointerEvent){
    const p=point(e);setHoverTime(p)
    if(!interaction||interaction.pointerId!==e.pointerId)return
    if(interaction.type==='select'){const moved=interaction.moved||Math.hypot(e.clientX-interaction.originX,e.clientY-interaction.originY)>6;setInteraction({...interaction,x2:e.clientX,y2:e.clientY,moved});if(moved&&columnsRef.current){const selL=Math.min(interaction.x1,e.clientX),selR=Math.max(interaction.x1,e.clientX),selT=Math.min(interaction.y1,e.clientY),selB=Math.max(interaction.y1,e.clientY);const hitIds:string[]=[];columnsRef.current.querySelectorAll('[data-block-id]').forEach(el=>{const r=el.getBoundingClientRect();if(r.left<selR&&r.right>selL&&r.top<selB&&r.bottom>selT){const id=el.getAttribute('data-block-id');if(id)hitIds.push(id)}});setTentativeIds(hitIds)}return}
    const moved=interaction.moved||Math.hypot(e.clientX-interaction.originX,e.clientY-interaction.originY)>6
    if(interaction.type==='create')setInteraction({...interaction,current:p.time,moved})
    if(interaction.type==='move')setInteraction({...interaction,dateIndex:p.day,start:clamp(snapTime(p.time-interaction.offset,settings.snapMinutes),0,24-(interaction.block.end-interaction.block.start)),moved})
    if(interaction.type==='resize')setInteraction({...interaction,end:clamp(p.time,interaction.block.start+settings.snapMinutes/60,24),moved})
    const scroll=scrollRef.current;if(scroll){const rect=scroll.getBoundingClientRect();if(e.clientY>rect.bottom-30)scroll.scrollTop+=10;if(e.clientY<rect.top+30)scroll.scrollTop-=10}
  }
  function end(e:React.PointerEvent){
    if(!interaction||interaction.pointerId!==e.pointerId)return
    if(interaction.type==='select'){
      const finalIds=[...tentativeIds];setTentativeIds([])
      if(interaction.moved){if(finalIds.length)onSelectMany(finalIds);else onClearSelection()}else onClearSelection()
      setInteraction(null);return
    }
    if(interaction.type==='create'){
      if(!interaction.moved){setInteraction(null);return}
      const low=Math.min(interaction.start,interaction.current), high=Math.max(interaction.start,interaction.current)
      if(high<=low){setInteraction(null);return}
      const start=low;const end=high
      const block=onCreate({date:toISO(dates[interaction.dateIndex]),start,end,title:'',categoryId:settings.defaultCategoryId,layer});onSelect(block.id,false);onOpen(block.id)
    }
    if(interaction.type==='move'&&!interaction.moved&&interaction.openOnRelease)onOpen(interaction.block.id)
    if(interaction.type==='move'&&interaction.moved){const duration=interaction.block.end-interaction.block.start;const movingGroup=selectedIds.includes(interaction.block.id)&&selectedIds.length>1;if(movingGroup){const originalIndex=dates.findIndex(d=>toISO(d)===interaction.block.date);const dayDelta=interaction.dateIndex-originalIndex;const timeDelta=interaction.start-interaction.block.start;onUpdateMany(blocks.filter(b=>selectedIds.includes(b.id)).map(b=>{const ownDuration=b.end-b.start;const nextStart=clamp(b.start+timeDelta,0,24-ownDuration);return {...b,date:toISO(addDays(fromISO(b.date),dayDelta)),start:nextStart,end:nextStart+ownDuration}}))}else onUpdate({...interaction.block,date:toISO(dates[interaction.dateIndex]),start:interaction.start,end:interaction.start+duration},'move')}
    if(interaction.type==='resize'&&interaction.moved)onUpdate({...interaction.block,end:interaction.end},'resize')
    setInteraction(null)
  }
  function preview(){
    if(!interaction||!interaction.moved)return null
    if(interaction.type==='select')return null
    if(interaction.type==='create'){const start=Math.min(interaction.start,interaction.current),end=Math.max(interaction.start,interaction.current);if(end<=start)return null;return {dateIndex:interaction.dateIndex,start,end,title:'',categoryId:settings.defaultCategoryId}}
    if(interaction.type==='move')return {dateIndex:interaction.dateIndex,start:interaction.start,end:interaction.start+(interaction.block.end-interaction.block.start),title:interaction.block.title,categoryId:interaction.block.categoryId}
    if(interaction.type==='resize')return {dateIndex:dates.findIndex(d=>toISO(d)===interaction.block.date),start:interaction.block.start,end:interaction.end,title:interaction.block.title,categoryId:interaction.block.categoryId}
    return null
  }
  const live=preview();const now=new Date();const nowIndex=dates.findIndex(d=>toISO(d)===toISO(now));const nowTime=now.getHours()+now.getMinutes()/60
  const cardTop=(b:{start:number})=>b.start*hourHeight+1
  const cardHeight=(b:{start:number,end:number})=>Math.max(1,(b.end-b.start)*hourHeight-2)
  const catOf=(b:{categoryId:string})=>categories.find(c=>c.id===b.categoryId)!

  return <div className="calendar-surface" style={{'--scrollbar-width':`${scrollbarWidth}px`} as React.CSSProperties}>
    <div className="day-header-grid" style={{'--day-count':dates.length} as React.CSSProperties}><div className="zone-header">GMT+5:30</div>{dates.map(d=><div className={`day-header ${toISO(d)===toISO(new Date())?'today':''}`} key={toISO(d)}><span>{DAY_NAMES[(d.getDay()+6)%7]}</span><b>{d.getDate()}</b></div>)}<div className="scrollbar-spacer" style={scrollbarWidth===0?{display:'none'}:undefined}/></div>
    <div className="all-day-grid" style={{'--day-count':dates.length} as React.CSSProperties}><button className="all-day-label">All-day <ChevronDown size={10}/></button>{dates.map(d=><div className="all-day-cell" key={toISO(d)}>{allDay.filter(b=>b.date===toISO(d)).map(b=><button key={b.id} onClick={()=>onOpen(b.id)}>{b.title}</button>)}</div>)}<div className="scrollbar-spacer" style={scrollbarWidth===0?{display:'none'}:undefined}/></div>
    <div className="time-scroll" ref={scrollRef}>
      <div className="time-canvas" style={{height:24*hourHeight}}>
        <div className="time-rail">{Array.from({length:24},(_,h)=><span key={h} style={{top:h*hourHeight-6}}>{formatTime(h,settings.timeFormat).replace(':00','')}</span>)}</div>
        <div className="week-columns" ref={columnsRef} style={{'--day-count':dates.length} as React.CSSProperties} onPointerDown={beginCreate} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{setInteraction(null);setTentativeIds([])}} onPointerLeave={()=>setHoverTime(null)}>
          {dates.map((date,index)=><div className={`time-column ${toISO(date)===toISO(new Date())?'today':''}`} key={toISO(date)}>{Array.from({length:24},(_,h)=><div key={h}><i className="hour-rule" style={{top:h*hourHeight}}/><i className="half-rule" style={{top:(h+.5)*hourHeight}}/></div>)}{(date.getDay()===0||date.getDay()===6)&&<div className="weekend-wash"/>}{<><div className="sleep-wash top" style={{height:settings.wakeHour*hourHeight}}/><div className="sleep-wash bottom" style={{top:settings.sleepHour*hourHeight,height:(24-settings.sleepHour)*hourHeight}}/></>}
            {ghostBlocks.filter(b=>b.date===toISO(date)).map(b=><EventCard key={`g-${b.id}`} block={b} category={catOf(b)} settings={settings} top={cardTop(b)} height={cardHeight(b)} left={2} width={96} selected={false} ghost/>)}
            {manipulationGhosts.filter(b=>b.date===toISO(date)).map(b=>{const l=overlapLayout(currentBlocks.filter(x=>x.date===b.date),categoryOrder).get(b.id)??{left:0,width:100};return <EventCard key={`origin-${b.id}`} block={b} category={catOf(b)} settings={settings} top={cardTop(b)} height={cardHeight(b)} left={l.left+1} width={l.width-2} selected={false} ghost originGhost/>})}
            {displayBlocks.filter(b=>b.date===toISO(date)).map(b=>{const l=layouts.get(b.id)??{left:0,width:100};return <EventCard key={b.id} block={b} category={catOf(b)} settings={settings} top={cardTop(b)} height={cardHeight(b)} left={l.left+1} width={l.width-2} selected={selectedIds.includes(b.id)||tentativeIds.includes(b.id)} onPointerDown={beginEvent} onSelect={e=>{if(!e.shiftKey&&!e.ctrlKey&&!e.metaKey)onOpen(b.id)}} onContextMenu={e=>onEventContext(b.id,e.clientX,e.clientY)}/>})}
            {live&&interaction?.type==='create'&&live.dateIndex===index&&<div className="event-preview" style={{top:cardTop(live),height:cardHeight(live),'--event-color':catOf(live)?.color} as React.CSSProperties}><b>{live.title}</b><span>{formatTime(live.start,settings.timeFormat)} – {formatTime(live.end,settings.timeFormat)}</span></div>}
          </div>)}
          {nowIndex>=0&&<div className="now-line" style={{top:nowTime*hourHeight,left:`calc(${nowIndex/dates.length*100}% + 1px)`,width:`${100/dates.length}%`}}><span>{formatTime(nowTime,settings.timeFormat)}</span></div>}
          {hoverTime&&!interaction&&<div className={`hover-time${scrollRef.current&&hoverTime.time*hourHeight>scrollRef.current.scrollTop+scrollRef.current.clientHeight-24?' flip':''}`} style={{top:hoverTime.time>=24?24*hourHeight-1:hoverTime.time*hourHeight,left:`${hoverTime.day/dates.length*100}%`,width:`${100/dates.length}%`}}><span>{formatTime(hoverTime.time,settings.timeFormat)}</span></div>}
        </div>
      </div>
    </div>
    {interaction?.type==='select'&&interaction.moved&&<div className="selection-rect" style={{left:Math.min(interaction.x1,interaction.x2),top:Math.min(interaction.y1,interaction.y2),width:Math.abs(interaction.x2-interaction.x1),height:Math.abs(interaction.y2-interaction.y1)}}/>}
    {interaction?.moved&&interaction.type!=='select'&&<div className="drag-tooltip">{interaction.type==='move'?`Move to ${DAY_NAMES[interaction.dateIndex]} ${formatTime(interaction.start,settings.timeFormat)}`:interaction.type==='resize'?`${formatTime(interaction.end,settings.timeFormat)} · ${Math.round((interaction.end-interaction.block.start)*60)} min`:`${formatTime(Math.min(interaction.start,interaction.current),settings.timeFormat)} – ${formatTime(Math.max(interaction.start,interaction.current),settings.timeFormat)}`}</div>}
  </div>
}
