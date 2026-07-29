import type { CalendarBlock, RecurrenceScope, TodoItem, TodoTab } from './types'

export type TodoFilter='all'|'open'|'done'

export function resolveTodoLinkClick(activeTodoId:string,linkedBlockIds:string[],blockId:string,keepLinking:boolean){
  const alreadyLinked=linkedBlockIds.includes(blockId)
  return{alreadyLinked,nextLinkedBlockIds:alreadyLinked?linkedBlockIds:[...new Set([...linkedBlockIds,blockId])],shiftClickedTodoId:keepLinking?activeTodoId:null,closeImmediately:!keepLinking}
}

export function shouldEndShiftLinking(clickedTodoId:string|null,activeTodoId:string,shiftKey:boolean){
  return clickedTodoId===activeTodoId&&!shiftKey
}

export function visibleTodoTabs(tabs:TodoTab[],items:TodoItem[],filter:TodoFilter){
  const byTab=new Map<string,TodoItem[]>()
  items.forEach(item=>{const tabItems=byTab.get(item.tabId);tabItems?tabItems.push(item):byTab.set(item.tabId,[item])})
  return tabs.filter(tab=>{const tabItems=byTab.get(tab.id)??[];return !!tab.favorite||tabItems.length===0||filter==='all'||tabItems.some(item=>filter==='open'?!item.completed:!!item.completed)})
}

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
