'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { DAY_NAMES } from '@/lib/calendar/constants'
import { addDays, formatTime, fromISO, snapTime, toISO } from '@/lib/calendar/date'
import type { CalendarBlock, CalendarCategory, CalendarSettings, Layer } from '@/lib/calendar/types'
import { EventCard } from './EventCard'

type Interaction =
  | {type:'create';pointerId:number;originX:number;originY:number;dateIndex:number;start:number;current:number;moved:boolean}
  | {type:'move';pointerId:number;originX:number;originY:number;block:CalendarBlock;offset:number;dateIndex:number;start:number;moved:boolean}
  | {type:'resize';pointerId:number;originX:number;originY:number;block:CalendarBlock;end:number;moved:boolean}

type Props={dates:Date[];blocks:CalendarBlock[];categories:CalendarCategory[];settings:CalendarSettings;layer:Layer;selectedIds:string[];onSelect:(id:string,additive:boolean)=>void;onClearSelection:()=>void;onCreate:(b:Omit<CalendarBlock,'id'>)=>CalendarBlock;onUpdate:(b:CalendarBlock)=>void;onUpdateMany:(b:CalendarBlock[])=>void;onOpen:(id:string)=>void;onEventContext:(id:string,x:number,y:number)=>void}

const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))

function overlapLayout(blocks:CalendarBlock[]){
  const result=new Map<string,{left:number;width:number}>()
  const sorted=[...blocks].sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start))
  const groups:CalendarBlock[][]=[]
  sorted.forEach(block=>{const group=groups.find(g=>g.some(x=>x.start<block.end&&block.start<x.end));if(group)group.push(block);else groups.push([block])})
  groups.forEach(group=>{
    const columns:CalendarBlock[][]=[]
    group.forEach(block=>{let index=columns.findIndex(col=>col.every(x=>x.end<=block.start||block.end<=x.start));if(index<0){index=columns.length;columns.push([])}columns[index].push(block)})
    columns.forEach((column,index)=>column.forEach(block=>result.set(block.id,{left:index/columns.length*100,width:100/columns.length})))
  })
  return result
}

export function WeekGrid({dates,blocks,categories,settings,layer,selectedIds,onSelect,onClearSelection,onCreate,onUpdate,onUpdateMany,onOpen,onEventContext}:Props){
  const hourHeight=60*(settings.hourScale??1)
  const scrollRef=useRef<HTMLDivElement>(null)
  const columnsRef=useRef<HTMLDivElement>(null)
  const [interaction,setInteraction]=useState<Interaction|null>(null)
  const [hoverTime,setHoverTime]=useState<{day:number;time:number}|null>(null)
  const [scrollbarWidth,setScrollbarWidth]=useState(0)
  const visibleCats=new Set(categories.filter(c=>c.visible).map(c=>c.id))
  const currentBlocks=blocks.filter(b=>b.layer===layer&&!b.allDay&&visibleCats.has(b.categoryId)&&dates.some(d=>toISO(d)===b.date))
  const ghostBlocks=layer==='actual'?blocks.filter(b=>b.layer==='plan'&&!b.allDay&&visibleCats.has(b.categoryId)&&dates.some(d=>toISO(d)===b.date)):[]
  const allDay=blocks.filter(b=>b.layer===layer&&b.allDay&&visibleCats.has(b.categoryId)&&dates.some(d=>toISO(d)===b.date))

  useLayoutEffect(()=>{const node=scrollRef.current;if(node)node.scrollTop=Math.max(0,(settings.wakeHour-1)*hourHeight)},[hourHeight,settings.wakeHour,dates.length])
  useLayoutEffect(()=>{const measure=()=>{const node=scrollRef.current;if(node)setScrollbarWidth(node.offsetWidth-node.clientWidth)};measure();window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure)},[dates.length])

  const layouts=useMemo(()=>{
    const map=new Map<string,{left:number;width:number}>()
    dates.forEach(d=>{const date=toISO(d);overlapLayout(currentBlocks.filter(b=>b.date===date)).forEach((v,k)=>map.set(k,v))})
    return map
  },[currentBlocks,dates])

  function point(e:React.PointerEvent){
    const rect=columnsRef.current!.getBoundingClientRect();const width=rect.width/dates.length
    const day=clamp(Math.floor((e.clientX-rect.left)/width),0,dates.length-1)
    const time=clamp(snapTime((e.clientY-rect.top)/hourHeight,settings.snapMinutes),0,24)
    return {day,time}
  }
  function beginCreate(e:React.PointerEvent){
    if(e.button!==0||!columnsRef.current)return
    const p=point(e);(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setInteraction({type:'create',pointerId:e.pointerId,originX:e.clientX,originY:e.clientY,dateIndex:p.day,start:p.time,current:p.time,moved:false});onClearSelection()
  }
  function beginEvent(e:React.PointerEvent,kind:'move'|'resize',block:CalendarBlock){
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p=point(e);onSelect(block.id,e.shiftKey)
    if(kind==='move')setInteraction({type:'move',pointerId:e.pointerId,originX:e.clientX,originY:e.clientY,block,offset:p.time-block.start,dateIndex:p.day,start:block.start,moved:false})
    else setInteraction({type:'resize',pointerId:e.pointerId,originX:e.clientX,originY:e.clientY,block,end:block.end,moved:false})
  }
  function move(e:React.PointerEvent){
    const p=point(e);setHoverTime(p)
    if(!interaction||interaction.pointerId!==e.pointerId)return
    const moved=interaction.moved||Math.hypot(e.clientX-interaction.originX,e.clientY-interaction.originY)>4
    if(interaction.type==='create')setInteraction({...interaction,current:p.time,moved})
    if(interaction.type==='move')setInteraction({...interaction,dateIndex:p.day,start:clamp(snapTime(p.time-interaction.offset,settings.snapMinutes),0,24-(interaction.block.end-interaction.block.start)),moved})
    if(interaction.type==='resize')setInteraction({...interaction,end:clamp(p.time,interaction.block.start+settings.snapMinutes/60,24),moved})
    const scroll=scrollRef.current;if(scroll){const rect=scroll.getBoundingClientRect();if(e.clientY>rect.bottom-30)scroll.scrollTop+=10;if(e.clientY<rect.top+30)scroll.scrollTop-=10}
  }
  function end(e:React.PointerEvent){
    if(!interaction||interaction.pointerId!==e.pointerId)return
    if(interaction.type==='create'){
      const low=Math.min(interaction.start,interaction.current), high=Math.max(interaction.start,interaction.current)
      const start=interaction.moved?low:interaction.start;const end=interaction.moved&&high>low?high:clamp(start+settings.defaultDuration,0,24)
      const block=onCreate({date:toISO(dates[interaction.dateIndex]),start,end,title:'',categoryId:settings.defaultCategoryId,layer});onSelect(block.id,false);onOpen(block.id)
    }
    if(interaction.type==='move'&&interaction.moved){const duration=interaction.block.end-interaction.block.start;const movingGroup=selectedIds.includes(interaction.block.id)&&selectedIds.length>1;if(movingGroup){const originalIndex=dates.findIndex(d=>toISO(d)===interaction.block.date);const dayDelta=interaction.dateIndex-originalIndex;const timeDelta=interaction.start-interaction.block.start;onUpdateMany(blocks.filter(b=>selectedIds.includes(b.id)).map(b=>{const ownDuration=b.end-b.start;const nextStart=clamp(b.start+timeDelta,0,24-ownDuration);return {...b,date:toISO(addDays(fromISO(b.date),dayDelta)),start:nextStart,end:nextStart+ownDuration}}))}else onUpdate({...interaction.block,date:toISO(dates[interaction.dateIndex]),start:interaction.start,end:interaction.start+duration})}
    if(interaction.type==='resize'&&interaction.moved)onUpdate({...interaction.block,end:interaction.end})
    setInteraction(null)
  }
  function preview(){
    if(!interaction)return null
    if(interaction.type==='create'){const start=Math.min(interaction.start,interaction.current),end=interaction.moved?Math.max(interaction.start,interaction.current):start+settings.defaultDuration;return {dateIndex:interaction.dateIndex,start,end,title:'',categoryId:settings.defaultCategoryId}}
    if(interaction.type==='move')return {dateIndex:interaction.dateIndex,start:interaction.start,end:interaction.start+(interaction.block.end-interaction.block.start),title:interaction.block.title,categoryId:interaction.block.categoryId}
    return {dateIndex:dates.findIndex(d=>toISO(d)===interaction.block.date),start:interaction.block.start,end:interaction.end,title:interaction.block.title,categoryId:interaction.block.categoryId}
  }
  const live=preview();const now=new Date();const nowIndex=dates.findIndex(d=>toISO(d)===toISO(now));const nowTime=now.getHours()+now.getMinutes()/60

  return <div className="calendar-surface" style={{'--scrollbar-width':`${scrollbarWidth}px`} as React.CSSProperties}>
    <div className="day-header-grid" style={{'--day-count':dates.length} as React.CSSProperties}><div className="zone-header">GMT+5:30</div>{dates.map(d=><div className={`day-header ${toISO(d)===toISO(new Date())?'today':''}`} key={toISO(d)}><span>{DAY_NAMES[(d.getDay()+6)%7]}</span><b>{d.getDate()}</b></div>)}<div className="scrollbar-spacer"/></div>
    <div className="all-day-grid" style={{'--day-count':dates.length} as React.CSSProperties}><button className="all-day-label">All-day <ChevronDown size={10}/></button>{dates.map(d=><div className="all-day-cell" key={toISO(d)}>{allDay.filter(b=>b.date===toISO(d)).map(b=><button key={b.id} onClick={()=>onOpen(b.id)}>{b.title}</button>)}</div>)}<div className="scrollbar-spacer"/></div>
    <div className="time-scroll" ref={scrollRef}>
      <div className="time-canvas" style={{height:24*hourHeight}}>
        <div className="time-rail">{Array.from({length:24},(_,h)=><span key={h} style={{top:h*hourHeight-6}}>{formatTime(h,settings.timeFormat).replace(':00','')}</span>)}</div>
        <div className="week-columns" ref={columnsRef} style={{'--day-count':dates.length} as React.CSSProperties} onPointerDown={beginCreate} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>setInteraction(null)} onPointerLeave={()=>setHoverTime(null)}>
          {dates.map((date,index)=><div className={`time-column ${toISO(date)===toISO(new Date())?'today':''}`} key={toISO(date)}>{Array.from({length:24},(_,h)=><div key={h}><i className="hour-rule" style={{top:h*hourHeight}}/><i className="half-rule" style={{top:(h+.5)*hourHeight}}/></div>)}{(date.getDay()===0||date.getDay()===6)&&<div className="weekend-wash"/>}{<><div className="sleep-wash top" style={{height:settings.wakeHour*hourHeight}}/><div className="sleep-wash bottom" style={{top:settings.sleepHour*hourHeight,height:(24-settings.sleepHour)*hourHeight}}/></>}
            {ghostBlocks.filter(b=>b.date===toISO(date)).map(b=>{const c=categories.find(c=>c.id===b.categoryId)!;return <EventCard key={`g-${b.id}`} block={b} category={c} settings={settings} top={b.start*hourHeight+2} height={(b.end-b.start)*hourHeight-4} left={2} width={96} selected={false} ghost/>})}
            {currentBlocks.filter(b=>b.date===toISO(date)).map(b=>{const c=categories.find(c=>c.id===b.categoryId)!;const l=layouts.get(b.id)??{left:0,width:100};return <EventCard key={b.id} block={b} category={c} settings={settings} top={b.start*hourHeight+2} height={(b.end-b.start)*hourHeight-4} left={l.left+1} width={l.width-2} selected={selectedIds.includes(b.id)} onPointerDown={beginEvent} onSelect={e=>{if(!e.shiftKey)onOpen(b.id)}} onContextMenu={e=>onEventContext(b.id,e.clientX,e.clientY)}/>})}
            {live&&live.dateIndex===index&&<div className="event-preview" style={{top:live.start*hourHeight+2,height:Math.max(15,(live.end-live.start)*hourHeight-4),'--event-color':categories.find(c=>c.id===live.categoryId)?.color} as React.CSSProperties}><b>{live.title}</b><span>{formatTime(live.start,settings.timeFormat)} – {formatTime(live.end,settings.timeFormat)}</span></div>}
          </div>)}
          {nowIndex>=0&&<div className="now-line" style={{top:nowTime*hourHeight,left:`calc(${nowIndex/dates.length*100}% + 1px)`,width:`${100/dates.length}%`}}><span>{formatTime(nowTime,settings.timeFormat)}</span></div>}
          {hoverTime&&!interaction&&<div className="hover-time" style={{top:hoverTime.time*hourHeight,left:`${hoverTime.day/dates.length*100}%`,width:`${100/dates.length}%`}}><span>{formatTime(hoverTime.time,settings.timeFormat)}</span></div>}
        </div>
      </div>
    </div>
    {interaction&&<div className="drag-tooltip">{interaction.type==='move'?`Move to ${DAY_NAMES[interaction.dateIndex]} ${formatTime(interaction.start,settings.timeFormat)}`:interaction.type==='resize'?`${formatTime(interaction.end,settings.timeFormat)} · ${Math.round((interaction.end-interaction.block.start)*60)} min`:`${formatTime(Math.min(interaction.start,interaction.current),settings.timeFormat)} – ${formatTime(Math.max(interaction.start,interaction.current),settings.timeFormat)}`}</div>}
  </div>
}
