'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadDemoCalendar, normalizeCalendarData } from '@/lib/calendar/seed'
import type { CalendarBlock, CalendarData, CalendarSettings, Layer } from '@/lib/calendar/types'

const STORAGE_KEY='tempo-calendar-v2'
const HISTORY_LIMIT=50

export function useCalendarStore() {
  const [data,setData]=useState<CalendarData>(()=>loadDemoCalendar())
  const dataRef=useRef(data)
  const [ready,setReady]=useState(false)
  const [past,setPast]=useState<CalendarData[]>([])
  const [future,setFuture]=useState<CalendarData[]>([])
  const [undo,setUndo]=useState<{label:string}|null>(null)

  useEffect(()=>{dataRef.current=data},[data])
  useEffect(()=>{
    try { const raw=localStorage.getItem(STORAGE_KEY);if(raw){const parsed=JSON.parse(raw);if(parsed.version===2)setData(normalizeCalendarData(parsed))} }
    catch { localStorage.removeItem(STORAGE_KEY) }
    setReady(true)
  },[])
  useEffect(()=>{if(ready)localStorage.setItem(STORAGE_KEY,JSON.stringify(data))},[data,ready])

  const commit=useCallback((change:(current:CalendarData)=>CalendarData)=>{
    setData(current=>{setPast(items=>[...items.slice(-(HISTORY_LIMIT-1)),structuredClone(current)]);setFuture([]);return change(current)})
  },[])
  const undoHistory=useCallback(()=>{setPast(items=>{if(!items.length)return items;const previous=items[items.length-1];setFuture(next=>[structuredClone(dataRef.current),...next].slice(0,HISTORY_LIMIT));setData(previous);return items.slice(0,-1)})},[])
  const redoHistory=useCallback(()=>{setFuture(items=>{if(!items.length)return items;const next=items[0];setPast(previous=>[...previous,structuredClone(dataRef.current)].slice(-HISTORY_LIMIT));setData(next);return items.slice(1)})},[])

  const addBlock=useCallback((block:CalendarBlock)=>commit(v=>({...v,blocks:[...v.blocks,block]})),[commit])
  const createBlock=useCallback((block:Omit<CalendarBlock,'id'>)=>{const created={...block,id:crypto.randomUUID()};addBlock(created);return created},[addBlock])
  const updateBlock=useCallback((block:CalendarBlock)=>commit(v=>({...v,blocks:v.blocks.map(b=>b.id===block.id?block:b)})),[commit])
  const updateBlocks=useCallback((changes:CalendarBlock[])=>{const map=new Map(changes.map(b=>[b.id,b]));commit(v=>({...v,blocks:v.blocks.map(b=>map.get(b.id)??b)}))},[commit])
  const deleteBlocks=useCallback((ids:string[])=>{commit(v=>({...v,blocks:v.blocks.filter(b=>!ids.includes(b.id))}));setUndo({label:`Deleted ${ids.length===1?'block':`${ids.length} blocks`}`})},[commit])
  const patchSettings=useCallback((patch:Partial<CalendarSettings>)=>commit(v=>({...v,settings:{...v.settings,...patch}})),[commit])
  const toggleCategory=useCallback((id:string)=>commit(v=>({...v,categories:v.categories.map(c=>c.id===id?{...c,visible:!c.visible}:c)})),[commit])
  const toggleGroup=useCallback((groupId:string)=>commit(v=>{const members=v.categories.filter(c=>c.groupId===groupId),show=members.some(c=>!c.visible);return {...v,categories:v.categories.map(c=>c.groupId===groupId?{...c,visible:show}:c)}}),[commit])
  const reorderCategories=useCallback((sourceId:string,targetId:string)=>commit(v=>{const items=[...v.categories],from=items.findIndex(c=>c.id===sourceId),to=items.findIndex(c=>c.id===targetId);if(from<0||to<0)return v;const targetGroup=items[to].groupId;const [moved]=items.splice(from,1);items.splice(to,0,{...moved,groupId:targetGroup});return {...v,categories:items}}),[commit])
  const renameCategory=useCallback((id:string,name:string)=>commit(v=>({...v,categories:v.categories.map(c=>c.id===id?{...c,name}:c)})),[commit])
  const createCategory=useCallback(()=>{const category={id:crypto.randomUUID(),name:'New calendar',color:'#7da3e8',visible:true,groupId:dataRef.current.groups[0]?.id};commit(v=>({...v,categories:[...v.categories,category]}));return category},[commit])
  const colorCategory=useCallback((id:string,color:string)=>commit(v=>({...v,categories:v.categories.map(c=>c.id===id?{...c,color}:c)})),[commit])
  const setDefaultCategory=useCallback((id:string)=>patchSettings({defaultCategoryId:id}),[patchSettings])
  const deleteCategory=useCallback((id:string)=>commit(v=>{if(v.categories.length<=1)return v;const remaining=v.categories.filter(c=>c.id!==id),fallback=remaining[0]?.id??'';return {...v,categories:remaining,blocks:v.blocks.filter(b=>b.categoryId!==id),settings:{...v.settings,defaultCategoryId:v.settings.defaultCategoryId===id?fallback:v.settings.defaultCategoryId}}}),[commit])
  const mergeCategory=useCallback((sourceId:string,targetId:string)=>commit(v=>({...v,categories:v.categories.filter(c=>c.id!==sourceId),blocks:v.blocks.map(b=>b.categoryId===sourceId?{...b,categoryId:targetId}:b),settings:{...v.settings,defaultCategoryId:v.settings.defaultCategoryId===sourceId?targetId:v.settings.defaultCategoryId}})),[commit])
  const setQuote=useCallback((quote:string)=>commit(v=>({...v,currentQuote:quote})),[commit])
  const nextQuote=useCallback(()=>commit(v=>{const index=v.quoteBank.indexOf(v.currentQuote);return {...v,currentQuote:v.quoteBank[(index+1+v.quoteBank.length)%v.quoteBank.length]}}),[commit])
  const copyPlanToActual=useCallback((dates:string[])=>{const current=dataRef.current,actuals=current.blocks.filter(b=>b.layer==='actual'),existing=new Set(actuals.filter(b=>b.sourcePlanId).map(b=>b.sourcePlanId)),natural=new Set(actuals.map(b=>`${b.date}|${b.title.toLocaleLowerCase()}`));const copies=current.blocks.filter(b=>b.layer==='plan'&&dates.includes(b.date)&&!existing.has(b.id)&&!natural.has(`${b.date}|${b.title.toLocaleLowerCase()}`)).map(b=>({...b,id:crypto.randomUUID(),layer:'actual' as Layer,sourcePlanId:b.id,status:'completed' as const}));if(copies.length)commit(v=>({...v,blocks:[...v.blocks,...copies]}));return copies.length},[commit])
  const reset=useCallback(()=>commit(()=>loadDemoCalendar()),[commit])
  const replaceData=useCallback((next:CalendarData)=>{if(next.version!==2||!Array.isArray(next.blocks)||!Array.isArray(next.categories))throw new Error('Unsupported calendar file');commit(()=>normalizeCalendarData(next))},[commit])
  const undoDelete=useCallback(()=>{undoHistory();setUndo(null)},[undoHistory])

  return useMemo(()=>({data,ready,undo,setUndo,canUndo:past.length>0,canRedo:future.length>0,undoHistory,redoHistory,undoDelete,addBlock,createBlock,updateBlock,updateBlocks,deleteBlocks,patchSettings,toggleCategory,toggleGroup,reorderCategories,renameCategory,createCategory,colorCategory,setDefaultCategory,deleteCategory,mergeCategory,setQuote,nextQuote,copyPlanToActual,reset,replaceData}),[data,ready,undo,past.length,future.length,undoHistory,redoHistory,undoDelete,addBlock,createBlock,updateBlock,updateBlocks,deleteBlocks,patchSettings,toggleCategory,toggleGroup,reorderCategories,renameCategory,createCategory,colorCategory,setDefaultCategory,deleteCategory,mergeCategory,setQuote,nextQuote,copyPlanToActual,reset,replaceData])
}
