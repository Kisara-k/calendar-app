import type { CalendarBlock } from './types'

export type EventLayout={left:number;width:number;overlay:boolean}

const overlaps=(a:CalendarBlock,b:CalendarBlock)=>a.start<b.end&&b.start<a.end

function placeInColumns(blocks:CalendarBlock[],left=0,width=100){const columns:CalendarBlock[][]=[];blocks.forEach(block=>{let index=columns.findIndex(column=>column.every(other=>!overlaps(block,other)));if(index<0){index=columns.length;columns.push([])}columns[index].push(block)});const columnWidth=width/Math.max(columns.length,1);return columns.flatMap((column,index)=>column.map(block=>[block.id,{left:left+index*columnWidth,width:columnWidth}] as const))}

export function overlapLayout(blocks:CalendarBlock[],categoryOrder:Map<string,number>,overlayRatio=.75){const result=new Map<string,EventLayout>(),sorted=[...blocks].sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start)||(categoryOrder.get(a.categoryId)??Number.MAX_SAFE_INTEGER)-(categoryOrder.get(b.categoryId)??Number.MAX_SAFE_INTEGER)),groups:CalendarBlock[][]=[];sorted.forEach(block=>{const group=groups.find(items=>items.some(other=>overlaps(block,other)));if(group)group.push(block);else groups.push([block])});groups.forEach(group=>{const overlays=group.filter(block=>group.some(other=>other.id!==block.id&&overlaps(block,other)&&block.end-block.start<=(other.end-other.start)*overlayRatio)),base=group.filter(block=>!overlays.includes(block));placeInColumns(base).forEach(([id,layout])=>result.set(id,{...layout,overlay:false}));placeInColumns(overlays,4,96).forEach(([id,layout])=>result.set(id,{...layout,overlay:true}))});return result}
