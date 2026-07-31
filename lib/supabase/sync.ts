import type { DatabaseDeltaPatch, DatabaseSnapshot } from './database'
import { replaceRows } from './rows'

export type DatabaseDelta={from_revision:number;to_revision:number;patch:DatabaseDeltaPatch}

const rowArrays=['upsert_groups','upsert_calendars','upsert_series','upsert_blocks','delete_group_ids','delete_calendar_ids','delete_series_ids','delete_block_ids','upsert_block_notes','delete_block_note_ids','upsert_todo_tabs','delete_todo_tab_ids','upsert_todo_items','delete_todo_item_ids','upsert_todo_item_notes','delete_todo_item_note_ids','upsert_todo_links','delete_todo_link_ids'] as const

export function parseDatabaseDelta(value:unknown,expectedRevision:number):DatabaseDelta{
  if(!value||typeof value!=='object')throw new Error('Invalid workspace delta')
  const delta=value as Partial<DatabaseDelta>,from=Number(delta.from_revision),to=Number(delta.to_revision),patch=delta.patch as DatabaseDeltaPatch|undefined
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from!==expectedRevision||to<from||!patch||typeof patch!=='object'||!rowArrays.every(key=>Array.isArray(patch[key]))||!(patch.account===null||typeof patch.account==='object'))throw new Error('Invalid workspace delta')
  return{from_revision:from,to_revision:to,patch}
}

export function applyDatabaseDelta(snapshot:DatabaseSnapshot,delta:DatabaseDelta):DatabaseSnapshot{
  if(delta.from_revision!==snapshot.revision||delta.to_revision<delta.from_revision)throw new Error('Workspace delta cursor mismatch')
  const patch=delta.patch,deletedBlocks=new Set(patch.delete_block_ids),deletedItems=new Set(patch.delete_todo_item_ids),blockNotes=replaceRows((snapshot.blockNotes??[]).filter(row=>!deletedBlocks.has(row.id)),patch.upsert_block_notes,patch.delete_block_note_ids),todoItemNotes=replaceRows((snapshot.todoItemNotes??[]).filter(row=>!deletedItems.has(row.id)),patch.upsert_todo_item_notes,patch.delete_todo_item_note_ids),todoLinks=replaceRows((snapshot.todoLinks??[]).filter(row=>!deletedItems.has(row.item_id)&&!deletedBlocks.has(row.block_id)),patch.upsert_todo_links,patch.delete_todo_link_ids)
  return{revision:delta.to_revision,account:patch.account??snapshot.account,groups:replaceRows(snapshot.groups,patch.upsert_groups,patch.delete_group_ids),calendars:replaceRows(snapshot.calendars,patch.upsert_calendars,patch.delete_calendar_ids),series:replaceRows(snapshot.series,patch.upsert_series,patch.delete_series_ids),blocks:replaceRows(snapshot.blocks,patch.upsert_blocks,patch.delete_block_ids),blockNotes,todoTabs:replaceRows(snapshot.todoTabs??[],patch.upsert_todo_tabs,patch.delete_todo_tab_ids),todoItems:replaceRows(snapshot.todoItems??[],patch.upsert_todo_items,patch.delete_todo_item_ids),todoItemNotes,todoLinks}
}
