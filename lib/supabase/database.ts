import type { User } from '@supabase/supabase-js'
import type { CalendarBlock, CalendarCategory, CalendarData, CalendarGroup, CalendarSettings, RecurrenceRule } from '@/lib/calendar/types'
import { normalizeCalendarData } from '@/lib/calendar/seed'
import { getSupabase } from './client'
export { mergeSnapshots, type MergeResult } from './merge'

type Account={settings:CalendarSettings;quote_bank:string[];current_quote:string}
type GroupRow={id:string;name:string;position:number}
type CalendarRow={id:string;group_id:string|null;name:string;color:string;is_visible:boolean;position:number;deleted_at:string|null}
type SeriesRow={id:string;recurrence:RecurrenceRule}
type BlockRow={id:string;category_id:string;date:string;start_minute:number;end_minute:number;title:string;layer:'plan'|'actual';notes:string|null;all_day:boolean;source_plan_id:string|null;status:string|null;series_id:string|null;occurrence_index:number|null;recurrence_date:string|null;recurrence_start_minute:number|null;recurrence_end_minute:number|null}
export type DatabaseSnapshot={revision:number;account:Account;groups:GroupRow[];calendars:CalendarRow[];series:SeriesRow[];blocks:BlockRow[]}
export type DatabasePatch={account:Account|null;upsert_groups:GroupRow[];delete_group_ids:string[];upsert_calendars:CalendarRow[];delete_calendar_ids:string[];upsert_series:SeriesRow[];delete_series_ids:string[];upsert_blocks:BlockRow[];delete_block_ids:string[]}

const minutes=(hours:number)=>Math.round(hours*60)
const hours=(value:number|null)=>value==null?undefined:value/60
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
const indexBy=<T extends{id:string}>(items:T[])=>new Map(items.map(item=>[item.id,item]))

export function toDatabaseSnapshot(data:CalendarData,revision=0):DatabaseSnapshot{
  const deleted=data.deletedCalendars??[],allCategories=[...data.categories,...deleted.map(item=>item.category)],allBlocks=[...data.blocks,...deleted.flatMap(item=>item.blocks)],deletedAt=new Map(deleted.map(item=>[item.category.id,item.deletedAt]))
  const series=new Map<string,SeriesRow>();allBlocks.forEach(block=>{if(block.seriesId&&block.recurrence&&!series.has(block.seriesId))series.set(block.seriesId,{id:block.seriesId,recurrence:block.recurrence})})
  return{revision,account:{settings:data.settings,quote_bank:data.quoteBank,current_quote:data.currentQuote},groups:data.groups.map((group,position)=>({id:group.id,name:group.name,position})),calendars:allCategories.map((category,position)=>({id:category.id,group_id:category.groupId??null,name:category.name,color:category.color,is_visible:category.visible,position,deleted_at:deletedAt.get(category.id)??null})),series:Array.from(series.values()),blocks:allBlocks.map(block=>({id:block.id,category_id:block.categoryId,date:block.date,start_minute:minutes(block.start),end_minute:minutes(block.end),title:block.title,layer:block.layer,notes:block.notes??null,all_day:block.allDay??false,source_plan_id:block.sourcePlanId??null,status:block.status??null,series_id:block.seriesId&&series.has(block.seriesId)?block.seriesId:null,occurrence_index:block.occurrenceIndex??null,recurrence_date:block.recurrenceDate??null,recurrence_start_minute:block.recurrenceStart==null?null:minutes(block.recurrenceStart),recurrence_end_minute:block.recurrenceEnd==null?null:minutes(block.recurrenceEnd)}))}
}

function changed<T extends{id:string}>(before:T[],after:T[]){const previous=indexBy(before);return after.filter(item=>!same(previous.get(item.id),item))}
function removed<T extends{id:string}>(before:T[],after:T[]){const next=indexBy(after);return before.filter(item=>!next.has(item.id)).map(item=>item.id)}

export function diffSnapshots(previous:DatabaseSnapshot|null,next:DatabaseSnapshot):DatabasePatch{
  return{account:previous&&same(previous.account,next.account)?null:next.account,upsert_groups:previous?changed(previous.groups,next.groups):next.groups,delete_group_ids:previous?removed(previous.groups,next.groups):[],upsert_calendars:previous?changed(previous.calendars,next.calendars):next.calendars,delete_calendar_ids:previous?removed(previous.calendars,next.calendars):[],upsert_series:previous?changed(previous.series,next.series):next.series,delete_series_ids:previous?removed(previous.series,next.series):[],upsert_blocks:previous?changed(previous.blocks,next.blocks):next.blocks,delete_block_ids:previous?removed(previous.blocks,next.blocks):[]}
}

export const patchIsEmpty=(patch:DatabasePatch)=>!patch.account&&!patch.upsert_groups.length&&!patch.delete_group_ids.length&&!patch.upsert_calendars.length&&!patch.delete_calendar_ids.length&&!patch.upsert_series.length&&!patch.delete_series_ids.length&&!patch.upsert_blocks.length&&!patch.delete_block_ids.length

export async function applyPatch(patch:DatabasePatch,mutationId:string,baseRevision:number){const{data,error}=await getSupabase().rpc('apply_patch',{p_patch:patch,p_mutation_id:mutationId,p_base_revision:baseRevision});if(error)throw error;return data as number}

export const isRevisionConflict=(error:unknown)=>typeof error==='object'&&error!==null&&(('code' in error&&error.code==='40001')||('message' in error&&String(error.message).toLowerCase().includes('workspace revision conflict')))

export async function fetchSnapshot(_userId:string):Promise<DatabaseSnapshot|null>{
  const{data,error}=await getSupabase().rpc('get_snapshot')
  if(error)throw error
  if(!data)return null
  const snapshot=data as DatabaseSnapshot
  return{...snapshot,revision:Number(snapshot.revision)}
}

export async function fetchRevision(userId:string):Promise<number|null>{const{data,error}=await getSupabase().from('accounts').select('revision').eq('user_id',userId).maybeSingle();if(error)throw error;return data?Number(data.revision):null}

export function fromDatabaseSnapshot(snapshot:DatabaseSnapshot):CalendarData{
  const rules=new Map(snapshot.series.map(item=>[item.id,item.recurrence])),calendarRows=[...snapshot.calendars].sort((a,b)=>a.position-b.position),groups=[...snapshot.groups].sort((a,b)=>a.position-b.position).map(({id,name})=>({id,name} as CalendarGroup)),categories=calendarRows.map(row=>({id:row.id,name:row.name,color:row.color,visible:row.is_visible,groupId:row.group_id??undefined} as CalendarCategory)),categoryById=new Map(categories.map(category=>[category.id,category])),blocks=snapshot.blocks.map(row=>({id:row.id,categoryId:row.category_id,date:row.date,start:row.start_minute/60,end:row.end_minute/60,title:row.title,layer:row.layer,notes:row.notes??undefined,allDay:row.all_day||undefined,sourcePlanId:row.source_plan_id??undefined,status:(row.status as CalendarBlock['status'])??undefined,seriesId:row.series_id??undefined,recurrence:row.series_id?rules.get(row.series_id):undefined,occurrenceIndex:row.occurrence_index??undefined,recurrenceDate:row.recurrence_date??undefined,recurrenceStart:hours(row.recurrence_start_minute),recurrenceEnd:hours(row.recurrence_end_minute)})),deletedRows=calendarRows.filter(row=>row.deleted_at),deletedIds=new Set(deletedRows.map(row=>row.id)),activeCategories=categories.filter(category=>!deletedIds.has(category.id)),activeBlocks=blocks.filter(block=>!deletedIds.has(block.categoryId)),deletedCalendars=deletedRows.map(row=>({category:categoryById.get(row.id)!,blocks:blocks.filter(block=>block.categoryId===row.id),deletedAt:row.deleted_at!}))
  return normalizeCalendarData({version:2,settings:snapshot.account.settings,quoteBank:snapshot.account.quote_bank,currentQuote:snapshot.account.current_quote,groups,categories:activeCategories,blocks:activeBlocks,deletedCalendars})
}

export function seedUserNames(data:CalendarData,user:User){
  if(data.settings.userFirstName||data.settings.userLastName)return data
  const metadata=user.user_metadata??{},full=String(metadata.full_name??metadata.name??'').trim(),parts=full.split(/\s+/).filter(Boolean),first=String(metadata.given_name??parts[0]??metadata.username??'').trim(),last=String(metadata.family_name??parts.slice(1).join(' ')??'').trim()
  return{...data,settings:{...data.settings,userFirstName:first||undefined,userLastName:last||undefined}}
}
