const fs=require('node:fs')
const test=require('node:test')
const assert=require('node:assert/strict')
const ts=require('typescript')

require.extensions['.ts']=(module,filename)=>{const source=fs.readFileSync(filename,'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;module._compile(output,filename)}

const {mergeSnapshots}=require('../lib/supabase/merge.ts')

const snapshot=()=>({revision:4,account:{settings:{wakeHour:7,sleepHour:22,snapMinutes:15,defaultDuration:60,hourScale:64,showWeekends:true,timeFormat:'12h',underlayOpacity:40,defaultCategoryId:'work'},quote_bank:['Focus'],current_quote:'Focus'},groups:[{id:'group',name:'Main',position:0}],calendars:[{id:'work',group_id:'group',name:'Work',color:'#123456',is_visible:true,position:0,deleted_at:null}],series:[],blocks:[{id:'block',category_id:'work',date:'2026-07-14',start_minute:540,end_minute:600,title:'Plan',layer:'plan',notes:null,all_day:false,source_plan_id:null,status:null,series_id:null,occurrence_index:null,recurrence_date:null,recurrence_start_minute:null,recurrence_end_minute:null}]})

test('three-way merge combines independent fields on the same row',()=>{const base=snapshot(),local=structuredClone(base),remote=structuredClone(base);local.blocks[0].title='Local title';remote.blocks[0].notes='Remote note';remote.revision=5;const result=mergeSnapshots(base,local,remote);assert.deepEqual(result.conflicts,[]);assert.equal(result.snapshot.revision,5);assert.equal(result.snapshot.blocks[0].title,'Local title');assert.equal(result.snapshot.blocks[0].notes,'Remote note')})

test('three-way merge reports overlapping edits and keeps local as the proposed resolution',()=>{const base=snapshot(),local=structuredClone(base),remote=structuredClone(base);local.blocks[0].title='Local title';remote.blocks[0].title='Remote title';const result=mergeSnapshots(base,local,remote);assert.deepEqual(result.conflicts,['blocks.block.title']);assert.equal(result.snapshot.blocks[0].title,'Local title')})

test('delete versus edit is an explicit conflict',()=>{const base=snapshot(),local=structuredClone(base),remote=structuredClone(base);local.blocks=[];remote.blocks[0].title='Remote title';const result=mergeSnapshots(base,local,remote);assert.deepEqual(result.conflicts,['blocks.block']);assert.equal(result.snapshot.blocks.length,0)})

test('independent row changes merge without conflict',()=>{const base=snapshot(),local=structuredClone(base),remote=structuredClone(base);local.blocks.push({...local.blocks[0],id:'local',title:'Local block'});remote.groups[0].name='Remote group';const result=mergeSnapshots(base,local,remote);assert.deepEqual(result.conflicts,[]);assert.equal(result.snapshot.groups[0].name,'Remote group');assert.equal(result.snapshot.blocks.find(block=>block.id==='local').title,'Local block')})

test('independent settings fields merge without replacing the settings object',()=>{const base=snapshot(),local=structuredClone(base),remote=structuredClone(base);local.account.settings.hourScale=72;remote.account.settings.showWeekends=false;const result=mergeSnapshots(base,local,remote);assert.deepEqual(result.conflicts,[]);assert.equal(result.snapshot.account.settings.hourScale,72);assert.equal(result.snapshot.account.settings.showWeekends,false)})

test('object key order does not create false changes or conflicts',()=>{const base=snapshot(),local=structuredClone(base),remote=structuredClone(base);local.account.settings=Object.fromEntries(Object.entries(local.account.settings).reverse());remote.groups[0].name='Remote group';const result=mergeSnapshots(base,local,remote);assert.deepEqual(result.conflicts,[]);assert.equal(result.snapshot.groups[0].name,'Remote group')})

test('server conflict choice keeps independent local edits',()=>{const base=snapshot(),local=structuredClone(base),remote=structuredClone(base);local.blocks[0].title='Local title';local.blocks[0].notes='Local note';remote.blocks[0].title='Remote title';const result=mergeSnapshots(base,remote,local);assert.deepEqual(result.conflicts,['blocks.block.title']);assert.equal(result.snapshot.blocks[0].title,'Remote title');assert.equal(result.snapshot.blocks[0].notes,'Local note')})
