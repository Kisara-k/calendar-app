const fs=require('node:fs')
const test=require('node:test')
const assert=require('node:assert/strict')
const ts=require('typescript')

require.extensions['.ts']=(module,filename)=>{const source=fs.readFileSync(filename,'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;module._compile(output,filename)}

const {timedBlockAllocations,timedBlockSegments,uniqueTimedHours}=require('../lib/calendar/block-time.ts')
const block=(id,date,start,end,categoryId='work')=>({id,date,start,end,title:id,categoryId,layer:'plan'})

test('multi-day timed blocks split at midnight with local clock times',()=>{assert.deepEqual(timedBlockSegments(block('trip','2026-08-03',22,50)).map(({date,start,end,first,last})=>({date,start,end,first,last})),[{date:'2026-08-03',start:22,end:24,first:true,last:false},{date:'2026-08-04',start:0,end:24,first:false,last:false},{date:'2026-08-05',start:0,end:2,first:false,last:true}])})

test('date-scoped allocations include spill-in and clip spill-out',()=>{const blocks=[block('spill-in','2026-08-02',23,26),block('spill-out','2026-08-04',23,26)],dates=new Set(['2026-08-03','2026-08-04']),allocations=timedBlockAllocations(blocks,dates);assert.deepEqual(allocations.map(({block,date,start,end})=>[block.id,date,start,end]),[['spill-in','2026-08-03',0,2],['spill-out','2026-08-04',23,24]])})

test('unique timed hours merge overlaps per actual calendar day',()=>{const dates=new Set(['2026-08-03','2026-08-04']),allocations=timedBlockAllocations([block('overnight','2026-08-03',22,26),block('overlap','2026-08-04',1,3),block('other-category','2026-08-04',2,4,'personal')],dates);assert.equal(uniqueTimedHours(allocations),6);assert.equal(uniqueTimedHours(allocations.filter(allocation=>allocation.date==='2026-08-03')),2);assert.equal(uniqueTimedHours(allocations.filter(allocation=>allocation.date==='2026-08-04')),4)})

test('all-day placeholders never enter timed allocations',()=>{const allDay={...block('all-day','2026-08-03',0,24),allDay:true};assert.deepEqual(timedBlockAllocations([allDay],new Set(['2026-08-03'])),[])})
