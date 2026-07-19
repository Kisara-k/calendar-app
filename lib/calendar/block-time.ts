import { addDays, differenceInCalendarDays, fromISO, toISO } from './date'
import type { CalendarBlock } from './types'

export type TimedBlockSegment={date:string;start:number;end:number;dayOffset:number;first:boolean;last:boolean}

export function timedBlockSegments(block:Pick<CalendarBlock,'date'|'start'|'end'>):TimedBlockSegment[]{const lastOffset=Math.max(0,Math.ceil(block.end/24)-1);return Array.from({length:lastOffset+1},(_,dayOffset)=>({date:toISO(addDays(fromISO(block.date),dayOffset)),start:dayOffset===0?block.start:0,end:Math.min(24,block.end-dayOffset*24),dayOffset,first:dayOffset===0,last:dayOffset===lastOffset})).filter(segment=>segment.end>segment.start)}

export function blockTimeOnDate(blockDate:string,date:string,time:number){return differenceInCalendarDays(fromISO(date),fromISO(blockDate))*24+time}

export function endClockTime(end:number){return ((end%24)+24)%24}
