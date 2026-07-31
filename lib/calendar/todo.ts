import type { CalendarBlock, RecurrenceScope, TodoItem, TodoTab } from './types'

export type TodoFilter='all'|'open'|'done'
export type TodoTreeRow={item:TodoItem;depth:number}
export type TodoItemLayout={id:string;tabId:string;parentId?:string}
export type TodoNestingDirection='indent'|'outdent'

export function normalizeTodoHierarchy(items:TodoItem[]){
  const byId=new Map(items.map(item=>[item.id,item])),parents=new Map<string,string|undefined>()
  items.forEach(item=>{const parent=item.parentId?byId.get(item.parentId):undefined;parents.set(item.id,parent&&parent.id!==item.id&&parent.tabId===item.tabId?parent.id:undefined)})
  items.forEach(item=>{const seen=new Set([item.id]);let parentId=parents.get(item.id);while(parentId){if(seen.has(parentId)){parents.set(item.id,undefined);break}seen.add(parentId);parentId=parents.get(parentId)}})
  const normalized=items.map((item):TodoItem=>({...item,parentId:parents.get(item.id)})),tabOrder=Array.from(new Set(normalized.map(item=>item.tabId))),result:TodoItem[]=[]
  tabOrder.forEach(tabId=>{const tabItems=normalized.filter(item=>item.tabId===tabId),children=new Map<string|undefined,TodoItem[]>();tabItems.forEach(item=>{const list=children.get(item.parentId);list?list.push(item):children.set(item.parentId,[item])});const visit=(item:TodoItem)=>{result.push(item);(children.get(item.id)??[]).forEach(visit)};(children.get(undefined)??[]).forEach(visit)})
  return result
}

export function todoTreeRows(items:TodoItem[],tabId:string):TodoTreeRow[]{
  const normalized=normalizeTodoHierarchy(items.filter(item=>item.tabId===tabId)),children=new Map<string|undefined,TodoItem[]>()
  normalized.forEach(item=>{const list=children.get(item.parentId);list?list.push(item):children.set(item.parentId,[item])})
  const rows:TodoTreeRow[]=[]
  const visit=(item:TodoItem,depth:number)=>{rows.push({item,depth});(children.get(item.id)??[]).forEach(child=>visit(child,depth+1))}
  ;(children.get(undefined)??[]).forEach(item=>visit(item,0))
  return rows
}

export function filteredTodoTreeRows(rows:TodoTreeRow[],filter:TodoFilter){
  if(filter==='all')return rows
  const keep=new Set(rows.filter(({item})=>filter==='open'?!item.completed:!!item.completed).map(({item})=>item.id)),byId=new Map(rows.map(({item})=>[item.id,item]))
  Array.from(keep).forEach(id=>{let parentId=byId.get(id)?.parentId;while(parentId){keep.add(parentId);parentId=byId.get(parentId)?.parentId}})
  return rows.filter(({item})=>keep.has(item.id))
}

export function todoExpectedMinutes(items:TodoItem[]){
  const normalized=normalizeTodoHierarchy(items),children=new Map<string,TodoItem[]>(),result=new Map<string,number|undefined>()
  normalized.forEach(item=>{if(item.parentId){const list=children.get(item.parentId);list?list.push(item):children.set(item.parentId,[item])}})
  const resolve=(item:TodoItem,path=new Set<string>()):number|undefined=>{if(item.expectedMinutes!=null)return item.expectedMinutes;if(path.has(item.id))return undefined;const nextPath=new Set(path).add(item.id),values=(children.get(item.id)??[]).map(child=>resolve(child,nextPath)).filter((value):value is number=>value!=null),value=values.length?values.reduce((total,current)=>total+current,0):undefined;result.set(item.id,value);return value}
  normalized.forEach(item=>{if(!result.has(item.id))result.set(item.id,resolve(item))})
  return result
}

export function todoDescendantIds(items:TodoItem[],id:string){
  const children=new Map<string,string[]>(),descendants=new Set<string>()
  normalizeTodoHierarchy(items).forEach(item=>{if(item.parentId){const list=children.get(item.parentId);list?list.push(item.id):children.set(item.parentId,[item.id])}})
  const visit=(parentId:string)=>{(children.get(parentId)??[]).forEach(childId=>{if(descendants.has(childId))return;descendants.add(childId);visit(childId)})}
  visit(id)
  return descendants
}

export function insertTodoItem(items:TodoItem[],item:TodoItem){
  if(!item.parentId)return[...items,item]
  const descendants=todoDescendantIds(items,item.parentId),parentIndex=items.findIndex(candidate=>candidate.id===item.parentId)
  if(parentIndex<0)return[...items,{...item,parentId:undefined}]
  let insertAt=parentIndex+1
  while(insertAt<items.length&&descendants.has(items[insertAt].id))insertAt++
  const next=[...items];next.splice(insertAt,0,item);return next
}

export function deleteTodoSubtree(items:TodoItem[],id:string){
  const removed=todoDescendantIds(items,id);removed.add(id);return items.filter(item=>!removed.has(item.id))
}

export function todoItemNesting(items:TodoItem[],id:string){
  const normalized=normalizeTodoHierarchy(items),item=normalized.find(candidate=>candidate.id===id)
  if(!item)return{depth:0,canIndent:false,canOutdent:false}
  const rows=todoTreeRows(normalized,item.tabId),index=rows.findIndex(row=>row.item.id===id),depth=rows[index]?.depth??0
  let canIndent=false
  for(let current=index-1;current>=0;current--){if(rows[current].depth<depth)break;if(rows[current].depth===depth){canIndent=true;break}}
  return{depth,canIndent,canOutdent:depth>0}
}

export function changeTodoItemNesting(items:TodoItem[],id:string,direction:TodoNestingDirection){
  const normalized=normalizeTodoHierarchy(items),source=normalized.find(item=>item.id===id)
  if(!source)return normalized
  const rows=todoTreeRows(normalized,source.tabId),sourceIndex=rows.findIndex(row=>row.item.id===id),sourceRow=rows[sourceIndex]
  if(!sourceRow)return normalized
  if(direction==='indent'){
    let parentId:string|undefined
    for(let index=sourceIndex-1;index>=0;index--){if(rows[index].depth<sourceRow.depth)break;if(rows[index].depth===sourceRow.depth){parentId=rows[index].item.id;break}}
    return parentId?normalizeTodoHierarchy(normalized.map(item=>item.id===id?{...item,parentId}:item)):normalized
  }
  if(!source.parentId)return normalized
  const parent=normalized.find(item=>item.id===source.parentId),parentRow=rows.find(row=>row.item.id===source.parentId)
  if(!parent||!parentRow)return normalized
  const subtreeIds=todoDescendantIds(normalized,id);subtreeIds.add(id)
  const subtree=rows.filter(row=>subtreeIds.has(row.item.id)).map(row=>row.item),remaining=normalized.filter(item=>!subtreeIds.has(item.id)),targetRows=todoTreeRows(remaining,source.tabId),parentIndex=targetRows.findIndex(row=>row.item.id===parent.id)
  let insertAt=parentIndex+1
  while(insertAt<targetRows.length&&targetRows[insertAt].depth>parentRow.depth)insertAt++
  const moved=subtree.map(item=>item.id===id?{...item,parentId:parent.parentId}:item),nextTab=targetRows.map(row=>row.item);nextTab.splice(insertAt,0,...moved)
  const tabOrder=Array.from(new Set(normalized.map(item=>item.tabId)))
  return normalizeTodoHierarchy(tabOrder.flatMap(tabId=>tabId===source.tabId?nextTab:remaining.filter(item=>item.tabId===tabId)))
}

function todoMoveProjection(items:TodoItem[],sourceId:string,targetId:string|null,targetTabId:string,horizontalDelta=0,indentWidth=14){
  const normalized=normalizeTodoHierarchy(items),source=normalized.find(item=>item.id===sourceId)
  if(!source)return null
  const descendants=todoDescendantIds(normalized,sourceId)
  if(targetId&&(targetId===sourceId||descendants.has(targetId)))return null
  const tabOrder=Array.from(new Set(normalized.map(item=>item.tabId))),sourceRows=todoTreeRows(normalized,source.tabId),sourceDepth=sourceRows.find(row=>row.item.id===sourceId)?.depth??0,subtreeIds=new Set(descendants).add(sourceId),subtree=sourceRows.filter(row=>subtreeIds.has(row.item.id)).map(row=>row.item),remaining=normalized.filter(item=>!subtreeIds.has(item.id)),targetRows=todoTreeRows(remaining,targetTabId)
  if(targetId&&!targetRows.some(row=>row.item.id===targetId))return null
  let insertAt=targetRows.length,projectedDepth=0
  if(targetId){
    const originalRows=todoTreeRows(normalized,targetTabId),sourceIndex=originalRows.findIndex(row=>row.item.id===sourceId),targetIndex=originalRows.findIndex(row=>row.item.id===targetId),remainingTarget=targetRows.findIndex(row=>row.item.id===targetId)
    insertAt=remainingTarget+(source.tabId===targetTabId&&sourceIndex>=0&&sourceIndex<targetIndex?1:0)
    const before=targetRows[insertAt-1],after=targetRows[insertAt],desired=sourceDepth+Math.round(horizontalDelta/indentWidth),minDepth=after?.depth??0,maxDepth=(before?.depth??-1)+1
    projectedDepth=Math.max(minDepth,Math.min(desired,maxDepth))
  }
  const before=targetRows[insertAt-1],parentId=projectedDepth===0?undefined:[...targetRows.slice(0,insertAt)].reverse().find(row=>row.depth===projectedDepth-1)?.item.id
  if(projectedDepth>0&&!parentId)projectedDepth=0
  return{normalized,source,tabOrder,subtree,remaining,targetRows,insertAt,projectedDepth,parentId,sourceDepth}
}

export function todoProjectedNestingDepth(items:TodoItem[],sourceId:string,targetId:string|null,targetTabId:string,horizontalDelta=0,indentWidth=14){
  const projection=todoMoveProjection(items,sourceId,targetId,targetTabId,horizontalDelta,indentWidth)
  return projection?.projectedDepth??todoItemNesting(items,sourceId).depth
}

export function moveTodoSubtree(items:TodoItem[],sourceId:string,targetId:string|null,targetTabId:string,horizontalDelta=0,indentWidth=14):TodoItem[]{
  const projection=todoMoveProjection(items,sourceId,targetId,targetTabId,horizontalDelta,indentWidth)
  if(!projection)return normalizeTodoHierarchy(items)
  const{source,tabOrder,subtree,remaining,targetRows,insertAt,projectedDepth,parentId}=projection
  const moved=subtree.map(item=>item.id===sourceId?{...item,tabId:targetTabId,parentId:projectedDepth===0?undefined:parentId}:{...item,tabId:targetTabId}),nextTarget=[...targetRows.map(row=>row.item)];nextTarget.splice(insertAt,0,...moved)
  const byTab=new Map<string,TodoItem[]>()
  remaining.forEach(item=>{if(item.tabId===targetTabId)return;const list=byTab.get(item.tabId);list?list.push(item):byTab.set(item.tabId,[item])})
  byTab.set(targetTabId,nextTarget)
  if(!tabOrder.includes(targetTabId))tabOrder.push(targetTabId)
  return normalizeTodoHierarchy(tabOrder.flatMap(tabId=>byTab.get(tabId)??[]))
}

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
