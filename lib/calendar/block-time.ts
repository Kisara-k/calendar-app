import { addDays, differenceInCalendarDays, fromISO, toISO } from './date'
import type { CalendarBlock } from './types'

export type TimedBlockSegment={date:string;start:number;end:number;dayOffset:number;first:boolean;last:boolean}
export type TimedBlockAllocation=TimedBlockSegment&{block:CalendarBlock}

export function timedBlockSegments(block:Pick<CalendarBlock,'date'|'start'|'end'>):TimedBlockSegment[]{const lastOffset=Math.max(0,Math.ceil(block.end/24)-1);return Array.from({length:lastOffset+1},(_,dayOffset)=>({date:toISO(addDays(fromISO(block.date),dayOffset)),start:dayOffset===0?block.start:0,end:Math.min(24,block.end-dayOffset*24),dayOffset,first:dayOffset===0,last:dayOffset===lastOffset})).filter(segment=>segment.end>segment.start)}

export function timedBlockAllocations(blocks:CalendarBlock[],dates:ReadonlySet<string>):TimedBlockAllocation[]{return blocks.filter(block=>!block.allDay).flatMap(block=>timedBlockSegments(block).filter(segment=>dates.has(segment.date)).map(segment=>({...segment,block})))}

export function uniqueTimedHours(segments:readonly Pick<TimedBlockSegment,'date'|'start'|'end'>[]){const byDate=new Map<string,[number,number][]>();segments.forEach(segment=>{const ranges=byDate.get(segment.date);ranges?ranges.push([segment.start,segment.end]):byDate.set(segment.date,[[segment.start,segment.end]])});let total=0;byDate.forEach(ranges=>{ranges.sort((a,b)=>a[0]-b[0]);let[s,e]=ranges[0]??[0,0];for(const[ns,ne]of ranges.slice(1)){if(ns<=e)e=Math.max(e,ne);else{total+=e-s;s=ns;e=ne}}total+=e-s});return total}

export function blockTimeOnDate(blockDate:string,date:string,time:number){return differenceInCalendarDays(fromISO(date),fromISO(blockDate))*24+time}

export function endClockTime(end:number){return ((end%24)+24)%24}
