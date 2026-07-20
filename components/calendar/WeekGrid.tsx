'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Copy, Plus } from 'lucide-react'
import { DAY_NAMES } from '@/lib/calendar/constants'
import { addDays, differenceInCalendarDays, formatTime, fromISO, snapTime, toISO } from '@/lib/calendar/date'
import { blockTimeOnDate, timedBlockSegments } from '@/lib/calendar/block-time'
import { overlapLayout } from '@/lib/calendar/layout'
import type { CalendarBlock, CalendarCategory, CalendarSettings, Layer } from '@/lib/calendar/types'
import { EventCard } from './EventCard'

type Interaction =
  | {type:'create';pointerId:number;originX:number;originY:number;dateIndex:number;start:number;currentDateIndex:number;current:number;moved:boolean}
  | {type:'move';pointerId:number;originX:number;originY:number;block:CalendarBlock;offset:number;grabDayOffset:number;visualStart:number;dateIndex:number;start:number;moved:boolean;openOnRelease:boolean;dropAllDay:boolean;allDayOrderIndex:number}
  | {type:'resize';pointerId:number;originX:number;originY:number;block:CalendarBlock;end:number;moved:boolean}
  | {type:'all-day-move';pointerId:number;originX:number;originY:number;block:CalendarBlock;dateIndex:number;orderIndex:number;moved:boolean;dropTimed:boolean;timedStart:number}
  | {type:'select';pointerId:number;originX:number;originY:number;x1:number;y1:number;x2:number;y2:number;moved:boolean}

type Props={dates:Date[];blocks:CalendarBlock[];categories:CalendarCategory[];settings:CalendarSettings;layer:Layer;selectedIds:string[];onSelect:(id:string,additive:boolean)=>void;onSelectMany:(ids:string[])=>void;onClearSelection:()=>void;onCreate:(b:Omit<CalendarBlock,'id'>)=>CalendarBlock;onUpdate:(b:CalendarBlock,action:'move'|'resize')=>void;onUpdateMany:(b:CalendarBlock[])=>void;onOpen:(id:string)=>void;onEventContext:(id:string,x:number,y:number)=>void;onCopyPlanDay:(date:string)=>void}

const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))

export function WeekGrid({dates,blocks,categories,settings,layer,selectedIds,onSelect,onSelectMany,onClearSelection,onCreate,onUpdate,onUpdateMany,onOpen,onEventContext,onCopyPlanDay}:Props){
  const hourHeight=60*(settings.hourScale??1)
  const scrollRef=useRef<HTMLDivElement>(null)
  const columnsRef=useRef<HTMLDivElement>(null)
  const allDayRef=useRef<HTMLDivElement>(null)
  const [interaction,setInteraction]=useState<Interaction|null>(null)
  const [tentativeIds,setTentativeIds]=useState<string[]>([])
  const [hoverTime,setHoverTime]=useState<{day:number;time:number}|null>(null)
  const [scrollbarWidth,setScrollbarWidth]=useState(0)
  const [bottomPadding,setBottomPadding]=useState(0)
  const visibleCats=new Set(categories.filter(c=>c.visible).map(c=>c.id))
  const categoryOrder=useMemo(()=>new Map(categories.map((c,index)=>[c.id,index])),[categories])
  const visibleDates=new Set(dates.map(toISO))
  const currentBlocks=blocks.filter(b=>b.layer===layer&&!b.allDay&&visibleCats.has(b.categoryId)&&timedBlockSegments(b).some(segment=>visibleDates.has(segment.date)))
  const displayBlocks=currentBlocks.map(block=>{
    if(!interaction?.moved)return block
    if(interaction.type==='resize'&&interaction.block.id===block.id)return {...block,end:interaction.end}
    if(interaction.type!=='move')return block
    if(interaction.dropAllDay&&block.id===interaction.block.id)return {...block,allDay:true}
    const movingGroup=selectedIds.includes(interaction.block.id)&&selectedIds.length>1
    if(block.id!==interaction.block.id&&(!movingGroup||!selectedIds.includes(block.id)))return block
    const dayDelta=differenceInCalendarDays(dates[interaction.dateIndex],addDays(fromISO(interaction.block.date),interaction.grabDayOffset)),timeDelta=interaction.start-interaction.block.start,duration=block.end-block.start
    const start=clamp(block.start+timeDelta,0,24-settings.snapMinutes/60)
    return {...block,date:toISO(addDays(fromISO(block.date),dayDelta)),start,end:start+duration}
  })
  const manipulationGhosts=!interaction?.moved?[]:interaction.type==='resize'?currentBlocks.filter(b=>b.id===interaction.block.id):interaction.type==='move'?currentBlocks.filter(b=>b.id===interaction.block.id||(selectedIds.includes(interaction.block.id)&&selectedIds.length>1&&selectedIds.includes(b.id))):[]
  const ghostBlocks=layer==='actual'?blocks.filter(b=>b.layer==='plan'&&!b.allDay&&visibleCats.has(b.categoryId)&&timedBlockSegments(b).some(segment=>visibleDates.has(segment.date))):[]
  const allDay=blocks.filter(b=>b.allDay&&visibleCats.has(b.categoryId)&&dates.some(d=>toISO(d)===b.date))
  const renderSegments=(items:CalendarBlock[])=>items.filter(block=>!block.allDay).flatMap(block=>timedBlockSegments(block).filter(segment=>visibleDates.has(segment.date)).map(segment=>({...segment,block,key:`${block.id}:${segment.date}`})))
  const displaySegments=renderSegments(displayBlocks),manipulationGhostSegments=renderSegments(manipulationGhosts),ghostSegments=renderSegments(ghostBlocks)

  useLayoutEffect(()=>{const node=scrollRef.current;if(node)node.scrollTop=Math.max(0,settings.wakeHour*hourHeight)},[hourHeight,settings.wakeHour,dates.length])
  useLayoutEffect(()=>{const node=scrollRef.current;if(!node)return;let frame=0;const measure=(align=false)=>{setScrollbarWidth(node.offsetWidth-node.clientWidth);setBottomPadding(Math.max(0,settings.wakeHour*hourHeight+node.clientHeight-24*hourHeight));if(align){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>node.scrollTop=Math.max(0,settings.wakeHour*hourHeight))}};measure(true);const ro=new ResizeObserver(()=>measure());ro.observe(node);return()=>{cancelAnimationFrame(frame);ro.disconnect()}},[hourHeight,settings.wakeHour])

  const layouts=useMemo(()=>{
    const map=new Map<string,{left:number;width:number;overlay:boolean}>()
    dates.forEach(d=>{const date=toISO(d),daySegments=displaySegments.filter(segment=>segment.date===date).map(segment=>({...segment.block,id:segment.key,date,start:segment.start,end:segment.end}));overlapLayout(daySegments,categoryOrder).forEach((v,k)=>map.set(k,v))})
    return map
  },[displaySegments,dates,categoryOrder])

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
    setInteraction({type:'create',pointerId:e.pointerId,originX:e.clientX,originY:e.clientY,dateIndex:p.day,start:p.time,currentDateIndex:p.day,current:p.time,moved:false});onClearSelection()
  }
  function createAllDay(date:Date){
    const block=onCreate({date:toISO(date),start:0,end:24,title:'',categoryId:settings.defaultCategoryId,layer,allDay:true});onSelect(block.id,false);onOpen(block.id)
  }
  const sortedAllDay=(date:string)=>allDay.filter(b=>b.date===date).sort((a,b)=>a.start-b.start)
  function displayedAllDay(date:string,dateIndex:number){
    const items=sortedAllDay(date);if(!interaction?.moved)return items
    if(interaction.type==='all-day-move'){const without=items.filter(b=>b.id!==interaction.block.id);if(!interaction.dropTimed&&interaction.dateIndex===dateIndex)without.splice(clamp(interaction.orderIndex,0,without.length),0,{...interaction.block,date});return without}
    if(interaction.type==='move'&&interaction.dropAllDay&&interaction.dateIndex===dateIndex){const without=items.filter(b=>b.id!==interaction.block.id);without.splice(clamp(interaction.allDayOrderIndex,0,without.length),0,{...interaction.block,date,allDay:true});return without}
    return items
  }
  function beginAllDay(e:React.PointerEvent,_kind:'move'|'resize',block:CalendarBlock){
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();allDayRef.current?.setPointerCapture(e.pointerId);const dateIndex=dates.findIndex(d=>toISO(d)===block.date),orderIndex=sortedAllDay(block.date).findIndex(b=>b.id===block.id)
    if(e.shiftKey||e.ctrlKey||e.metaKey)onSelect(block.id,true);else if(!selectedIds.includes(block.id))onSelect(block.id,false)
    setInteraction({type:'all-day-move',pointerId:e.pointerId,originX:e.clientX,originY:e.clientY,block,dateIndex,orderIndex,moved:false,dropTimed:false,timedStart:0})
  }
  function moveAllDay(e:React.PointerEvent){
    if(interaction?.type!=='all-day-move'||interaction.pointerId!==e.pointerId)return;const moved=interaction.moved||Math.hypot(e.clientX-interaction.originX,e.clientY-interaction.originY)>6,columns=columnsRef.current?.getBoundingClientRect();if(columns&&e.clientX>=columns.left&&e.clientX<=columns.right&&e.clientY>=columns.top&&e.clientY<=columns.bottom){const p=point(e);setInteraction({...interaction,dateIndex:p.day,timedStart:clamp(p.time,0,24-settings.snapMinutes/60),moved,dropTimed:true});return}const cells=Array.from(allDayRef.current?.querySelectorAll<HTMLElement>('[data-all-day-index]')??[]);if(!cells.length)return
    let dateIndex=0,distance=Infinity;cells.forEach((cell,index)=>{const rect=cell.getBoundingClientRect(),next=e.clientX<rect.left?rect.left-e.clientX:e.clientX>rect.right?e.clientX-rect.right:0;if(next<distance){distance=next;dateIndex=index}});const rect=cells[dateIndex].getBoundingClientRect(),target=sortedAllDay(toISO(dates[dateIndex])).filter(b=>b.id!==interaction.block.id),orderIndex=clamp(Math.round((e.clientY-rect.top-2)/23),0,target.length);setInteraction({...interaction,dateIndex,orderIndex,moved,dropTimed:false})
  }
  function endAllDay(e:React.PointerEvent){
    if(interaction?.type!=='all-day-move'||interaction.pointerId!==e.pointerId)return;if(!interaction.moved){onOpen(interaction.block.id);setInteraction(null);return}if(interaction.dropTimed){const start=interaction.timedStart;onUpdate({...interaction.block,date:toISO(dates[interaction.dateIndex]),start,end:start+settings.defaultDuration,allDay:false},'move');setInteraction(null);return}const sourceDate=interaction.block.date,targetDate=toISO(dates[interaction.dateIndex]),source=sortedAllDay(sourceDate).filter(b=>b.id!==interaction.block.id),target=sourceDate===targetDate?source:sortedAllDay(targetDate).filter(b=>b.id!==interaction.block.id);target.splice(clamp(interaction.orderIndex,0,target.length),0,{...interaction.block,date:targetDate});const ordered=sourceDate===targetDate?target:[...source,...target],seen=new Set<string>(),updates=ordered.filter(b=>!seen.has(b.id)&&seen.add(b.id)).map(b=>{const peers=b.date===sourceDate&&sourceDate!==targetDate?source:target,order=peers.findIndex(item=>item.id===b.id);return {...b,start:order/60,end:24}});onUpdateMany(updates);setInteraction(null)
  }
  function beginEvent(e:React.PointerEvent,kind:'move'|'resize',block:CalendarBlock,grabDayOffset=0,visualStart=block.start){
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();columnsRef.current?.setPointerCapture(e.pointerId)
    const p=point(e)
    if(kind==='resize')onClearSelection()
    else if(e.shiftKey||e.ctrlKey||e.metaKey)onSelect(block.id,true)
    else if(!selectedIds.includes(block.id))onSelect(block.id,false)
    const inMultiSelection=selectedIds.includes(block.id)&&selectedIds.length>1
    if(kind==='move')setInteraction({type:'move',pointerId:e.pointerId,originX:e.clientX,originY:e.clientY,block,offset:p.time-visualStart,grabDayOffset,visualStart,dateIndex:p.day,start:block.start,moved:false,openOnRelease:!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!inMultiSelection,dropAllDay:false,allDayOrderIndex:0})
    else setInteraction({type:'resize',pointerId:e.pointerId,originX:e.clientX,originY:e.clientY,block,end:block.end,moved:false})
  }
  function move(e:React.PointerEvent){
    const p=point(e);setHoverTime(p)
    if(!interaction||interaction.pointerId!==e.pointerId)return
    if(interaction.type==='select'){const moved=interaction.moved||Math.hypot(e.clientX-interaction.originX,e.clientY-interaction.originY)>6;setInteraction({...interaction,x2:e.clientX,y2:e.clientY,moved});if(moved&&columnsRef.current){const selL=Math.min(interaction.x1,e.clientX),selR=Math.max(interaction.x1,e.clientX),selT=Math.min(interaction.y1,e.clientY),selB=Math.max(interaction.y1,e.clientY);const hitIds:string[]=[];columnsRef.current.querySelectorAll('[data-block-id]').forEach(el=>{const r=el.getBoundingClientRect();if(r.left<selR&&r.right>selL&&r.top<selB&&r.bottom>selT){const id=el.getAttribute('data-block-id');if(id)hitIds.push(id)}});setTentativeIds(hitIds)}return}
    const moved=interaction.moved||Math.hypot(e.clientX-interaction.originX,e.clientY-interaction.originY)>6
    if(interaction.type==='create')setInteraction({...interaction,currentDateIndex:p.day,current:p.time,moved})
    if(interaction.type==='move'){const cells=Array.from(allDayRef.current?.querySelectorAll<HTMLElement>('[data-all-day-index]')??[]),allDayIndex=cells.findIndex(cell=>{const rect=cell.getBoundingClientRect();return e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom});if(allDayIndex>=0){const rect=cells[allDayIndex].getBoundingClientRect(),target=sortedAllDay(toISO(dates[allDayIndex])).filter(b=>b.id!==interaction.block.id),allDayOrderIndex=clamp(Math.round((e.clientY-rect.top-2)/23),0,target.length);setInteraction({...interaction,dateIndex:allDayIndex,moved,dropAllDay:true,allDayOrderIndex});return}setInteraction({...interaction,dateIndex:p.day,start:clamp(snapTime(interaction.block.start+p.time-interaction.offset-interaction.visualStart,settings.snapMinutes),0,24-settings.snapMinutes/60),moved,dropAllDay:false})}
    if(interaction.type==='resize')setInteraction({...interaction,end:clamp(blockTimeOnDate(interaction.block.date,toISO(dates[p.day]),p.time),interaction.block.start+settings.snapMinutes/60,168),moved})
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
      const origin=blockTimeOnDate(toISO(dates[0]),toISO(dates[interaction.dateIndex]),interaction.start),current=blockTimeOnDate(toISO(dates[0]),toISO(dates[interaction.currentDateIndex]),interaction.current),low=Math.min(origin,current),high=Math.max(origin,current)
      if(high<=low){setInteraction(null);return}
      const dayOffset=Math.floor(low/24),start=low-dayOffset*24,end=start+high-low
      const block=onCreate({date:toISO(addDays(dates[0],dayOffset)),start,end,title:'',categoryId:settings.defaultCategoryId,layer});onSelect(block.id,false);onOpen(block.id)
    }
    if(interaction.type==='move'&&!interaction.moved&&interaction.openOnRelease)onOpen(interaction.block.id)
    if(interaction.type==='move'&&interaction.moved){if(interaction.dropAllDay){const targetDate=toISO(dates[interaction.dateIndex]),target=sortedAllDay(targetDate).filter(b=>b.id!==interaction.block.id);target.splice(clamp(interaction.allDayOrderIndex,0,target.length),0,{...interaction.block,date:targetDate,allDay:true});onUpdateMany(target.map((b,index)=>({...b,start:index/60,end:24,allDay:true})));setInteraction(null);return}const duration=interaction.block.end-interaction.block.start,targetDate=addDays(dates[interaction.dateIndex],-interaction.grabDayOffset),movingGroup=selectedIds.includes(interaction.block.id)&&selectedIds.length>1;if(movingGroup){const dayDelta=differenceInCalendarDays(targetDate,fromISO(interaction.block.date));const timeDelta=interaction.start-interaction.block.start;onUpdateMany(blocks.filter(b=>selectedIds.includes(b.id)).map(b=>{const ownDuration=b.end-b.start;const nextStart=clamp(b.start+timeDelta,0,24-settings.snapMinutes/60);return {...b,date:toISO(addDays(fromISO(b.date),dayDelta)),start:nextStart,end:nextStart+ownDuration}}))}else onUpdate({...interaction.block,date:toISO(targetDate),start:interaction.start,end:interaction.start+duration},'move')}
    if(interaction.type==='resize'&&interaction.moved)onUpdate({...interaction.block,end:interaction.end},'resize')
    setInteraction(null)
  }
  function preview(){
    if(!interaction||!interaction.moved)return null
    if(interaction.type==='select')return null
    if(interaction.type==='create'){const origin=blockTimeOnDate(toISO(dates[0]),toISO(dates[interaction.dateIndex]),interaction.start),current=blockTimeOnDate(toISO(dates[0]),toISO(dates[interaction.currentDateIndex]),interaction.current),low=Math.min(origin,current),high=Math.max(origin,current);if(high<=low)return null;const dayOffset=Math.floor(low/24),start=low-dayOffset*24;return {id:'creation-preview',date:toISO(addDays(dates[0],dayOffset)),start,end:start+high-low,title:'',categoryId:settings.defaultCategoryId,layer} as CalendarBlock}
    return null
  }
  const live=preview(),liveSegments=live?renderSegments([live]):[],crossTimed=interaction?.type==='all-day-move'&&interaction.moved&&interaction.dropTimed?{...interaction.block,date:toISO(dates[interaction.dateIndex]),start:interaction.timedStart,end:interaction.timedStart+settings.defaultDuration,allDay:false}:null,crossTimedSegments=crossTimed?renderSegments([crossTimed]):[];const now=new Date();const nowIndex=dates.findIndex(d=>toISO(d)===toISO(now));const nowTime=now.getHours()+now.getMinutes()/60
  const cardTop=(b:{start:number})=>b.start*hourHeight+1
  const cardHeight=(b:{start:number,end:number})=>Math.max(1,(b.end-b.start)*hourHeight-2)
  const catOf=(b:{categoryId:string})=>categories.find(c=>c.id===b.categoryId)!

  return <div className="calendar-surface" style={{'--scrollbar-width':`${scrollbarWidth}px`} as React.CSSProperties}>
    <div className="day-header-grid" style={{'--day-count':dates.length} as React.CSSProperties}><div className="zone-header">GMT+5:30</div>{dates.map(d=>{const date=toISO(d);return <div className={`day-header ${date===toISO(new Date())?'today':''}`} key={date}><span>{DAY_NAMES[(d.getDay()+6)%7]}</span><b>{d.getDate()}</b>{layer==='actual'&&<button className="fill-plan-day" aria-label={`Fill ${DAY_NAMES[(d.getDay()+6)%7]} from plan`} title="Fill this day from plan" onClick={()=>onCopyPlanDay(date)}><Copy size={11}/></button>}</div>})}<div className="scrollbar-spacer" style={scrollbarWidth===0?{display:'none'}:undefined}/></div>
    <div className="all-day-grid" ref={allDayRef} style={{'--day-count':dates.length} as React.CSSProperties} onPointerMove={moveAllDay} onPointerUp={endAllDay} onPointerCancel={()=>setInteraction(null)}><button className="all-day-label">All-day <ChevronDown size={10}/></button>{dates.map((d,dateIndex)=>{const items=displayedAllDay(toISO(d),dateIndex);return <div className={`all-day-slot${items.length?' populated':''}`} data-all-day-index={dateIndex} key={toISO(d)}><div className="all-day-events" style={{height:items.length?items.length*23-2:0}}>{items.map((b,index)=><EventCard key={b.id} block={b} category={catOf(b)} settings={settings} top={index*23} height={21} left={0} width={100} selected={selectedIds.includes(b.id)} onPointerDown={beginAllDay} onSelect={()=>onOpen(b.id)} onContextMenu={e=>onEventContext(b.id,e.clientX,e.clientY)}/>)}</div><button className="all-day-create" aria-label={`Add all-day event on ${toISO(d)}`} onClick={()=>createAllDay(d)}><Plus size={11}/></button></div>})}<div className="scrollbar-spacer" style={scrollbarWidth===0?{display:'none'}:undefined}/></div>
    <div className="time-scroll" ref={scrollRef}>
      <div className="time-canvas" style={{height:24*hourHeight}}>
        <div className="time-rail">{Array.from({length:24},(_,h)=><span key={h} style={{top:h*hourHeight-6}}>{formatTime(h,settings.timeFormat).replace(':00','')}</span>)}</div>
        <div className="week-columns" ref={columnsRef} style={{'--day-count':dates.length} as React.CSSProperties} onPointerDown={beginCreate} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{setInteraction(null);setTentativeIds([])}} onPointerLeave={()=>setHoverTime(null)}>
          {dates.map((date,index)=><div className={`time-column ${toISO(date)===toISO(new Date())?'today':''}`} key={toISO(date)}>{Array.from({length:24},(_,h)=><div key={h}><i className="hour-rule" style={{top:h*hourHeight}}/><i className="half-rule" style={{top:(h+.5)*hourHeight}}/></div>)}{(date.getDay()===0||date.getDay()===6)&&<div className="weekend-wash"/>}{<><div className="sleep-wash top" style={{height:settings.wakeHour*hourHeight}}/><div className="sleep-wash bottom" style={{top:settings.sleepHour*hourHeight,height:(24-settings.sleepHour)*hourHeight}}/></>}
            {ghostSegments.filter(segment=>segment.date===toISO(date)).map(segment=>{const visual={...segment.block,date:segment.date,start:segment.start,end:segment.end};return <EventCard key={`g-${segment.key}`} block={visual} category={catOf(segment.block)} settings={settings} top={cardTop(segment)} height={cardHeight(segment)} left={1} width={98} selected={false} ghost/>})}
            {manipulationGhostSegments.filter(segment=>segment.date===toISO(date)).map(segment=>{const visual={...segment.block,date:segment.date,start:segment.start,end:segment.end};return <EventCard key={`origin-${segment.key}`} block={visual} category={catOf(segment.block)} settings={settings} top={cardTop(segment)} height={cardHeight(segment)} left={1} width={98} selected={false} ghost originGhost/>})}
            {displaySegments.filter(segment=>segment.date===toISO(date)).sort((a,b)=>Number(layouts.get(a.key)?.overlay)-Number(layouts.get(b.key)?.overlay)).map(segment=>{const l=layouts.get(segment.key)??{left:0,width:100,overlay:false},visual={...segment.block,date:segment.date,start:segment.start,end:segment.end};return <EventCard key={segment.key} block={visual} dataBlockId={segment.block.id} category={catOf(segment.block)} settings={settings} top={cardTop(segment)} height={cardHeight(segment)} left={l.left+1} width={l.width-2} selected={selectedIds.includes(segment.block.id)||tentativeIds.includes(segment.block.id)} overlay={l.overlay} resizable={segment.last} onPointerDown={(e,kind)=>beginEvent(e,kind,segment.block,segment.dayOffset,segment.start)} onSelect={e=>{if(!e.shiftKey&&!e.ctrlKey&&!e.metaKey)onOpen(segment.block.id)}} onContextMenu={e=>onEventContext(segment.block.id,e.clientX,e.clientY)}/>})}
            {interaction?.type==='create'&&liveSegments.filter(segment=>segment.date===toISO(date)).map(segment=>{const visual={...segment.block,date:segment.date,start:segment.start,end:segment.end};return <EventCard key={segment.key} block={visual} category={catOf(segment.block)} settings={settings} top={cardTop(segment)} height={cardHeight(segment)} left={1} width={98} selected={false} creationPreview/>})}
            {crossTimedSegments.filter(segment=>segment.date===toISO(date)).map(segment=>{const visual={...segment.block,date:segment.date,start:segment.start,end:segment.end};return <EventCard key={`cross-${segment.key}`} block={visual} category={catOf(segment.block)} settings={settings} top={cardTop(segment)} height={cardHeight(segment)} left={1} width={98} selected={false} creationPreview/>})}
          </div>)}
          <div className="day-bound-line" style={{top:settings.wakeHour*hourHeight}}/><div className="day-bound-line" style={{top:settings.sleepHour*hourHeight}}/>
          {nowIndex>=0&&<div className="now-line" style={{top:nowTime*hourHeight,left:`calc(${nowIndex/dates.length*100}% + 1px)`,width:`${100/dates.length}%`}}><span>{formatTime(nowTime,settings.timeFormat)}</span></div>}
          {hoverTime&&!interaction&&<div className={`hover-time${scrollRef.current&&hoverTime.time*hourHeight>scrollRef.current.scrollTop+scrollRef.current.clientHeight-24?' flip':''}`} style={{top:hoverTime.time>=24?24*hourHeight-1:hoverTime.time*hourHeight,left:`${hoverTime.day/dates.length*100}%`,width:`${100/dates.length}%`}}><span>{formatTime(hoverTime.time,settings.timeFormat)}</span></div>}
        </div>
      </div>
      <div aria-hidden="true" style={{height:bottomPadding}}/>
    </div>
    {interaction?.type==='select'&&interaction.moved&&<div className="selection-rect" style={{left:Math.min(interaction.x1,interaction.x2),top:Math.min(interaction.y1,interaction.y2),width:Math.abs(interaction.x2-interaction.x1),height:Math.abs(interaction.y2-interaction.y1)}}/>}
    {interaction?.moved&&interaction.type!=='select'&&interaction.type!=='all-day-move'&&<div className="drag-tooltip">{interaction.type==='move'?(interaction.dropAllDay?`Move to ${DAY_NAMES[(dates[interaction.dateIndex].getDay()+6)%7]} · all day`:`Move to ${DAY_NAMES[(dates[interaction.dateIndex].getDay()+6)%7]} ${formatTime(interaction.start,settings.timeFormat)}`):interaction.type==='resize'?`${formatTime(interaction.end,settings.timeFormat)} · ${Math.round((interaction.end-interaction.block.start)*60)} min`:live?`${formatTime(live.start,settings.timeFormat)} – ${formatTime(live.end,settings.timeFormat)}`:''}</div>}
    {interaction?.moved&&interaction.type==='all-day-move'&&<div className="drag-tooltip">{interaction.dropTimed?`Move to ${DAY_NAMES[(dates[interaction.dateIndex].getDay()+6)%7]} ${formatTime(interaction.timedStart,settings.timeFormat)}`:`Move to ${DAY_NAMES[(dates[interaction.dateIndex].getDay()+6)%7]} · position ${interaction.orderIndex+1}`}</div>}
  </div>
}
