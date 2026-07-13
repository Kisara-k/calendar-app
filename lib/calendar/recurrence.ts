import { addDays, fromISO, startOfWeek, toISO } from './date'
import type { CalendarBlock, RecurrenceRule, RecurrenceScope } from './types'

const recurringKeys=(['title','categoryId','layer','notes','allDay','status'] as const)
const weekdayNames=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

const weekdayIndex=(date:Date)=>(date.getDay()+6)%7
const daysBetween=(from:string,to:string)=>Math.round((fromISO(to).getTime()-fromISO(from).getTime())/86400000)
const moveDate=(date:string,days:number)=>toISO(addDays(fromISO(date),days))

function dominantTime(members:CalendarBlock[],key:'start'|'end'){
  const counts=new Map<number,number>()
  members.forEach(block=>counts.set(block[key],(counts.get(block[key])??0)+1))
  return Array.from(counts.entries()).sort((a,b)=>b[1]-a[1])[0]?.[0]??members[0]?.[key]??0
}

function seriesOrder(members:CalendarBlock[]){return new Map(members.map((block,index)=>[block.id,block.occurrenceIndex??index]))}

function canonicalize(block:CalendarBlock,baseStart:number,baseEnd:number){return {...block,recurrenceDate:block.recurrenceDate??block.date,recurrenceStart:block.recurrenceStart??baseStart,recurrenceEnd:block.recurrenceEnd??baseEnd}}

function recurringFieldChanges(original:CalendarBlock,next:CalendarBlock){return recurringKeys.reduce<Partial<CalendarBlock>>((changes,key)=>Object.is(original[key],next[key])?changes:{...changes,[key]:next[key]}, {})}

function isInScope(scope:RecurrenceScope,index:number,cut:number){return scope==='all'||index>=cut}

export function recurrenceMode(rule:RecurrenceRule):'daily'|'weekly'|'multiple'{return rule.mode??(rule.weekdays.length===7?'daily':rule.weekdays.length===1?'weekly':'multiple')}

export function recurrenceLabel(rule:RecurrenceRule){
  const mode=recurrenceMode(rule)
  if(mode==='daily'){
    const total=rule.weeks*7+(rule.days??0)
    return `Every day for ${total} ${total===1?'day':'days'}`
  }
  const schedule=mode==='weekly'?'Every week':`Every week on ${[...rule.weekdays].sort((a,b)=>a-b).map(day=>weekdayNames[day]).join(', ')}`
  return `${schedule} for ${rule.weeks} ${rule.weeks===1?'week':'weeks'}`
}

function dailyDates(start:Date,rule:RecurrenceRule){return Array.from({length:rule.weeks*7+(rule.days??0)},(_,offset)=>toISO(addDays(start,offset)))}

function weeklyDates(start:Date,rule:RecurrenceRule){
  const firstOffset=Array.from({length:7},(_,offset)=>offset).find(offset=>rule.weekdays.includes(weekdayIndex(addDays(start,offset))))??0
  const firstDate=addDays(start,firstOffset)
  const firstWeek=startOfWeek(firstDate)
  const dates:string[]=[]
  for(let week=0;week<rule.weeks;week++){
    if(week%rule.interval)continue
    for(const weekday of [...rule.weekdays].sort((a,b)=>a-b)){
      const date=toISO(addDays(firstWeek,week*7+weekday))
      if(date>=toISO(firstDate))dates.push(date)
    }
  }
  return dates
}

export function createSeries(block:CalendarBlock,rule:RecurrenceRule){
  const seriesId=block.seriesId??crypto.randomUUID()
  const start=fromISO(block.date)
  const dates=recurrenceMode(rule)==='daily'?dailyDates(start,rule):weeklyDates(start,rule)
  return dates.map((date,index)=>({...block,id:index===0?block.id:crypto.randomUUID(),date,seriesId,recurrence:rule,occurrenceIndex:index,recurrenceDate:date,recurrenceStart:block.start,recurrenceEnd:block.end}))
}

export function applyScopedUpdate(blocks:CalendarBlock[],original:CalendarBlock,next:CalendarBlock,scope:RecurrenceScope){
  if(!original.seriesId)return blocks.map(block=>block.id===original.id?next:block)

  const members=blocks.filter(block=>block.seriesId===original.seriesId)
  const order=seriesOrder(members)
  const baseStart=original.recurrenceStart??dominantTime(members,'start')
  const baseEnd=original.recurrenceEnd??dominantTime(members,'end')

  if(scope==='only')return blocks.map(block=>{
    if(block.seriesId!==original.seriesId)return block
    const canonical=canonicalize(block,baseStart,baseEnd)
    return block.id===original.id?{...next,seriesId:original.seriesId,occurrenceIndex:original.occurrenceIndex,recurrenceDate:canonical.recurrenceDate,recurrenceStart:canonical.recurrenceStart,recurrenceEnd:canonical.recurrenceEnd}:canonical
  })

  const cut=order.get(original.id)!
  const dateChanged=original.date!==next.date
  const startChanged=original.start!==next.start
  const endChanged=original.end!==next.end
  const dateShift=dateChanged?daysBetween(original.recurrenceDate??original.date,next.date):0
  const fieldChanges=recurringFieldChanges(original,next)

  return blocks.map(block=>{
    if(block.seriesId!==original.seriesId)return block
    const canonical=canonicalize(block,baseStart,baseEnd)
    const index=order.get(canonical.id)!
    if(!isInScope(scope,index,cut))return canonical

    const date=dateChanged?moveDate(canonical.recurrenceDate!,dateShift):canonical.date
    const start=startChanged?next.start:canonical.start
    const end=endChanged?next.end:canonical.end

    return {...canonical,...fieldChanges,date,start,end,seriesId:original.seriesId,occurrenceIndex:index,recurrenceDate:canonical.recurrenceDate,recurrenceStart:canonical.recurrenceStart,recurrenceEnd:canonical.recurrenceEnd}
  })
}

export function removeScoped(blocks:CalendarBlock[],block:CalendarBlock,scope:RecurrenceScope){
  if(!block.seriesId||scope==='only')return blocks.filter(candidate=>candidate.id!==block.id)
  const members=blocks.filter(candidate=>candidate.seriesId===block.seriesId)
  const order=seriesOrder(members)
  const cut=order.get(block.id)!
  return blocks.filter(candidate=>candidate.seriesId!==block.seriesId||(scope==='following'&&order.get(candidate.id)!<cut))
}

export function normalizedRule(block:CalendarBlock,mode:'daily'|'weekly'|'multiple',weekdays:number[],weeks:number,days=0):RecurrenceRule{return {frequency:'weekly',interval:1,weekdays:mode==='daily'?[0,1,2,3,4,5,6]:mode==='weekly'?[weekdayIndex(fromISO(block.date))]:[...weekdays].sort((a,b)=>a-b),weeks:Math.max(0,Math.round(weeks)||0),days:mode==='daily'?Math.max(0,Math.round(days)||0):undefined,mode}}
