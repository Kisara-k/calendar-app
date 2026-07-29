import type { CalendarBlock, RecurrenceScope } from './types'

export function recurringScopeIds(blocks:CalendarBlock[],block:CalendarBlock,scope:RecurrenceScope){
  if(!block.seriesId||scope==='only')return[block.id]
  const members=blocks.filter(candidate=>candidate.seriesId===block.seriesId).sort((a,b)=>(a.occurrenceIndex??0)-(b.occurrenceIndex??0)||a.date.localeCompare(b.date))
  if(scope==='all')return members.map(member=>member.id)
  const cut=members.findIndex(member=>member.id===block.id)
  return members.slice(Math.max(0,cut)).map(member=>member.id)
}

export function linkedAllocatedMinutes(blocks:CalendarBlock[],linkedBlockIds:string[]){
  const linked=new Set(linkedBlockIds)
  return Math.round(blocks.filter(block=>linked.has(block.id)&&!block.allDay).reduce((total,block)=>total+(block.end-block.start)*60,0))
}
