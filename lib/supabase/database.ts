import type { User } from '@supabase/supabase-js'
import type { CalendarBlock, CalendarCategory, CalendarData, CalendarGroup, CalendarSettings, RecurrenceRule } from '@/lib/calendar/types'
import { normalizeCalendarData } from '@/lib/calendar/seed'
import { getSupabase } from './client'
import { applyDatabaseDelta, parseDatabaseDelta, type DatabaseDelta } from './sync'
import { same, sparseRowChanges, type SparseRow } from './rows'
export { mergeSnapshots, type MergeResult } from './merge'
export { applyDatabaseDelta, parseDatabaseDelta, type DatabaseDelta } from './sync'

type Account={settings:CalendarSettings;quote_bank:string[];current_quote:string}
type AccountUpdate=Partial<Pick<Account,'quote_bank'|'current_quote'>>&{settings?:Partial<CalendarSettings>}
type GroupRow={id:string;name:string;position:number}
type CalendarRow={id:string;group_id:string|null;name:string;color:string;is_visible:boolean;position:number;deleted_at:string|null}
type SeriesRow={id:string;recurrence:RecurrenceRule}
type BlockRow={id:string;category_id:string;date:string;start_minute:number;end_minute:number;title:string;layer:'plan'|'actual';all_day:boolean;source_plan_id:string|null;status:string|null;series_id:string|null;occurrence_index:number|null;recurrence_date:string|null;recurrence_start_minute:number|null;recurrence_end_minute:number|null}
type BlockNoteRow={id:string;content:string}
export type DatabaseSnapshot={revision:number;account:Account;groups:GroupRow[];calendars:CalendarRow[];series:SeriesRow[];blocks:BlockRow[];blockNotes:BlockNoteRow[]}
export type DatabaseDeltaPatch={account:Account|null;upsert_groups:GroupRow[];delete_group_ids:string[];upsert_calendars:CalendarRow[];delete_calendar_ids:string[];upsert_series:SeriesRow[];delete_series_ids:string[];upsert_blocks:BlockRow[];delete_block_ids:string[];upsert_block_notes:BlockNoteRow[];delete_block_note_ids:string[]}
export type DatabaseWritePatch={account:Account|AccountUpdate|null;upsert_groups:GroupRow[];update_groups:SparseRow<GroupRow>[];delete_group_ids:string[];upsert_calendars:CalendarRow[];update_calendars:SparseRow<CalendarRow>[];delete_calendar_ids:string[];upsert_series:SeriesRow[];update_series:SparseRow<SeriesRow>[];delete_series_ids:string[];upsert_blocks:BlockRow[];update_blocks:SparseRow<BlockRow>[];delete_block_ids:string[];upsert_block_notes:BlockNoteRow[];update_block_notes:SparseRow<BlockNoteRow>[];delete_block_note_ids:string[]}
export type DatabasePatch=DatabaseDeltaPatch

const minutes=(hours:number)=>Math.round(hours*60)
const hours=(value:number|null)=>value==null?undefined:value/60

export function normalizeDatabaseSnapshot(value:DatabaseSnapshot):DatabaseSnapshot{
  const legacy=value as Omit<DatabaseSnapshot,'blocks'|'blockNotes'>&{blocks:(BlockRow&{notes?:string|null})[];blockNotes?:BlockNoteRow[]},blocks=legacy.blocks.map(row=>{const{notes,...block}=row;return block}),blockNotes=Array.isArray(legacy.blockNotes)?legacy.blockNotes:legacy.blocks.flatMap(row=>row.notes==null||row.notes===''?[]:[{id:row.id,content:row.notes}])
  return{...legacy,revision:Number(legacy.revision),blocks,blockNotes}
}

export function toDatabaseSnapshot(data:CalendarData,revision=0):DatabaseSnapshot{
  const deleted=data.deletedCalendars??[],allCategories=[...data.categories,...deleted.map(item=>item.category)],allBlocks=[...data.blocks,...deleted.flatMap(item=>item.blocks)],deletedAt=new Map(deleted.map(item=>[item.category.id,item.deletedAt]))
  const series=new Map<string,SeriesRow>();allBlocks.forEach(block=>{if(block.seriesId&&block.recurrence&&!series.has(block.seriesId))series.set(block.seriesId,{id:block.seriesId,recurrence:block.recurrence})})
  return{revision,account:{settings:data.settings,quote_bank:data.quoteBank,current_quote:data.currentQuote},groups:data.groups.map((group,position)=>({id:group.id,name:group.name,position})),calendars:allCategories.map((category,position)=>({id:category.id,group_id:category.groupId??null,name:category.name,color:category.color,is_visible:category.visible,position,deleted_at:deletedAt.get(category.id)??null})),series:Array.from(series.values()),blocks:allBlocks.map(block=>({id:block.id,category_id:block.categoryId,date:block.date,start_minute:minutes(block.start),end_minute:minutes(block.end),title:block.title,layer:block.layer,all_day:block.allDay??false,source_plan_id:block.sourcePlanId??null,status:block.status??null,series_id:block.seriesId&&series.has(block.seriesId)?block.seriesId:null,occurrence_index:block.occurrenceIndex??null,recurrence_date:block.recurrenceDate??null,recurrence_start_minute:block.recurrenceStart==null?null:minutes(block.recurrenceStart),recurrence_end_minute:block.recurrenceEnd==null?null:minutes(block.recurrenceEnd)})),blockNotes:allBlocks.flatMap(block=>block.notes==null||block.notes===''?[]:[{id:block.id,content:block.notes}])}
}

function accountChange(previous:Account|null,next:Account):Account|AccountUpdate|null{
  if(!previous)return next
  const settings=Object.fromEntries(Object.entries(next.settings).filter(([key,value])=>!same(previous.settings[key as keyof CalendarSettings],value))) as Partial<CalendarSettings>,change:AccountUpdate={}
  if(Object.keys(settings).length)change.settings=settings
  if(!same(previous.quote_bank,next.quote_bank))change.quote_bank=next.quote_bank
  if(!same(previous.current_quote,next.current_quote))change.current_quote=next.current_quote
  return Object.keys(change).length?change:null
}

export function diffSnapshots(previous:DatabaseSnapshot|null,next:DatabaseSnapshot):DatabaseWritePatch{
  const current=normalizeDatabaseSnapshot(next),groups=sparseRowChanges(previous?.groups??null,current.groups),calendars=sparseRowChanges(previous?.calendars??null,current.calendars),series=sparseRowChanges(previous?.series??null,current.series),blocks=sparseRowChanges(previous?.blocks??null,current.blocks),notes=sparseRowChanges(previous?.blockNotes??null,current.blockNotes)
  return{account:accountChange(previous?.account??null,current.account),upsert_groups:groups.upserts,update_groups:groups.updates,delete_group_ids:groups.deletes,upsert_calendars:calendars.upserts,update_calendars:calendars.updates,delete_calendar_ids:calendars.deletes,upsert_series:series.upserts,update_series:series.updates,delete_series_ids:series.deletes,upsert_blocks:blocks.upserts,update_blocks:blocks.updates,delete_block_ids:blocks.deletes,upsert_block_notes:notes.upserts,update_block_notes:notes.updates,delete_block_note_ids:notes.deletes}
}

export const patchIsEmpty=(patch:DatabaseWritePatch)=>!patch.account&&!patch.upsert_groups.length&&!patch.update_groups.length&&!patch.delete_group_ids.length&&!patch.upsert_calendars.length&&!patch.update_calendars.length&&!patch.delete_calendar_ids.length&&!patch.upsert_series.length&&!patch.update_series.length&&!patch.delete_series_ids.length&&!patch.upsert_blocks.length&&!patch.update_blocks.length&&!patch.delete_block_ids.length&&!patch.upsert_block_notes.length&&!patch.update_block_notes.length&&!patch.delete_block_note_ids.length

export async function applyPatch(patch:DatabaseWritePatch,mutationId:string,baseRevision:number){const{data,error}=await getSupabase().rpc('apply_patch',{p_patch:patch,p_mutation_id:mutationId,p_base_revision:baseRevision});if(error)throw error;return data as number}

export const isRevisionConflict=(error:unknown)=>typeof error==='object'&&error!==null&&(('code' in error&&error.code==='40001')||('message' in error&&String(error.message).toLowerCase().includes('workspace revision conflict')))

export async function fetchSnapshot(_userId:string):Promise<DatabaseSnapshot|null>{const{data,error}=await getSupabase().rpc('get_snapshot');if(error)throw error;return data?normalizeDatabaseSnapshot(data as DatabaseSnapshot):null}
export async function fetchDelta(revision:number):Promise<DatabaseDelta|null>{const{data,error}=await getSupabase().rpc('get_changes_since',{p_revision:revision});if(error)throw error;return data===null?null:parseDatabaseDelta(data,revision)}
export async function fetchChangedSnapshot(snapshot:DatabaseSnapshot):Promise<DatabaseSnapshot|null>{const delta=await fetchDelta(snapshot.revision);return delta?applyDatabaseDelta(snapshot,delta):null}

export function fromDatabaseSnapshot(value:DatabaseSnapshot):CalendarData{
  const snapshot=normalizeDatabaseSnapshot(value),rules=new Map(snapshot.series.map(item=>[item.id,item.recurrence])),notes=new Map(snapshot.blockNotes.map(item=>[item.id,item.content])),calendarRows=[...snapshot.calendars].sort((a,b)=>a.position-b.position),groups=[...snapshot.groups].sort((a,b)=>a.position-b.position).map(({id,name})=>({id,name} as CalendarGroup)),categories=calendarRows.map(row=>({id:row.id,name:row.name,color:row.color,visible:row.is_visible,groupId:row.group_id??undefined} as CalendarCategory)),categoryById=new Map(categories.map(category=>[category.id,category])),blocks=snapshot.blocks.map(row=>({id:row.id,categoryId:row.category_id,date:row.date,start:row.start_minute/60,end:row.end_minute/60,title:row.title,layer:row.layer,notes:notes.get(row.id),allDay:row.all_day||undefined,sourcePlanId:row.source_plan_id??undefined,status:(row.status as CalendarBlock['status'])??undefined,seriesId:row.series_id??undefined,recurrence:row.series_id?rules.get(row.series_id):undefined,occurrenceIndex:row.occurrence_index??undefined,recurrenceDate:row.recurrence_date??undefined,recurrenceStart:hours(row.recurrence_start_minute),recurrenceEnd:hours(row.recurrence_end_minute)})),deletedRows=calendarRows.filter(row=>row.deleted_at),deletedIds=new Set(deletedRows.map(row=>row.id)),activeCategories=categories.filter(category=>!deletedIds.has(category.id)),activeBlocks=blocks.filter(block=>!deletedIds.has(block.categoryId)),deletedCalendars=deletedRows.map(row=>({category:categoryById.get(row.id)!,blocks:blocks.filter(block=>block.categoryId===row.id),deletedAt:row.deleted_at!}))
  return normalizeCalendarData({version:2,settings:snapshot.account.settings,quoteBank:snapshot.account.quote_bank,currentQuote:snapshot.account.current_quote,groups,categories:activeCategories,blocks:activeBlocks,deletedCalendars})
}

export function seedUserNames(data:CalendarData,user:User){
  if(data.settings.userFirstName||data.settings.userLastName)return data
  const metadata=user.user_metadata??{},full=String(metadata.full_name??metadata.name??'').trim(),parts=full.split(/\s+/).filter(Boolean),first=String(metadata.given_name??parts[0]??metadata.username??'').trim(),last=String(metadata.family_name??parts.slice(1).join(' ')??'').trim()
  return{...data,settings:{...data.settings,userFirstName:first||undefined,userLastName:last||undefined}}
}
