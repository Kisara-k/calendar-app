'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadDemoCalendar } from '@/lib/calendar/seed'
import type { CalendarBlock, CalendarData, CalendarSettings, Layer } from '@/lib/calendar/types'

const STORAGE_KEY='tempo-calendar-v2'

export function useCalendarStore() {
  const [data,setData]=useState<CalendarData>(()=>loadDemoCalendar())
  const [ready,setReady]=useState(false)
  const [undo,setUndo]=useState<{blocks:CalendarBlock[];label:string}|null>(null)

  useEffect(()=>{
    try {
      const raw=localStorage.getItem(STORAGE_KEY)
      if(raw){ const parsed=JSON.parse(raw); if(parsed.version===2) setData(parsed) }
    } catch { localStorage.removeItem(STORAGE_KEY) }
    setReady(true)
  },[])
  useEffect(()=>{ if(ready) localStorage.setItem(STORAGE_KEY,JSON.stringify(data)) },[data,ready])

  const createBlock=useCallback((block:Omit<CalendarBlock,'id'>)=>{
    const created={...block,id:crypto.randomUUID()}
    setData(v=>({...v,blocks:[...v.blocks,created]})); return created
  },[])
  const updateBlock=useCallback((block:CalendarBlock)=>setData(v=>({...v,blocks:v.blocks.map(b=>b.id===block.id?block:b)})),[])
  const updateBlocks=useCallback((changes:CalendarBlock[])=>{
    const map=new Map(changes.map(b=>[b.id,b])); setData(v=>({...v,blocks:v.blocks.map(b=>map.get(b.id)??b)}))
  },[])
  const deleteBlocks=useCallback((ids:string[])=>{
    setData(v=>{const removed=v.blocks.filter(b=>ids.includes(b.id));setUndo({blocks:removed,label:`Deleted ${removed.length===1?'block':`${removed.length} blocks`}`});return {...v,blocks:v.blocks.filter(b=>!ids.includes(b.id))}})
  },[])
  const undoDelete=useCallback(()=>{ if(!undo)return;setData(v=>({...v,blocks:[...v.blocks,...undo.blocks]}));setUndo(null) },[undo])
  const patchSettings=useCallback((patch:Partial<CalendarSettings>)=>setData(v=>({...v,settings:{...v.settings,...patch}})),[])
  const toggleCategory=useCallback((id:string)=>setData(v=>({...v,categories:v.categories.map(c=>c.id===id?{...c,visible:!c.visible}:c)})),[])
  const copyPlanToActual=useCallback((dates:string[])=>{
    let count=0
    setData(v=>{
      const actuals=v.blocks.filter(b=>b.layer==='actual')
      const existing=new Set(actuals.filter(b=>b.sourcePlanId).map(b=>b.sourcePlanId))
      const naturalMatches=new Set(actuals.map(b=>`${b.date}|${b.title.toLocaleLowerCase()}`))
      const copies=v.blocks.filter(b=>b.layer==='plan'&&dates.includes(b.date)&&!existing.has(b.id)&&!naturalMatches.has(`${b.date}|${b.title.toLocaleLowerCase()}`)).map(b=>{count++;return {...b,id:crypto.randomUUID(),layer:'actual' as Layer,sourcePlanId:b.id,status:'completed' as const}})
      return {...v,blocks:[...v.blocks,...copies]}
    })
    return count
  },[])
  const reset=useCallback(()=>setData(loadDemoCalendar()),[])
  const replaceData=useCallback((next:CalendarData)=>{if(next.version!==2||!Array.isArray(next.blocks)||!Array.isArray(next.categories))throw new Error('Unsupported calendar file');setData(next)},[])

  return useMemo(()=>({data,ready,undo,setUndo,createBlock,updateBlock,updateBlocks,deleteBlocks,undoDelete,patchSettings,toggleCategory,copyPlanToActual,reset,replaceData}),[data,ready,undo,createBlock,updateBlock,updateBlocks,deleteBlocks,undoDelete,patchSettings,toggleCategory,copyPlanToActual,reset,replaceData])
}
