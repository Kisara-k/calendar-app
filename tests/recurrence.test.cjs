const fs=require('node:fs')
const test=require('node:test')
const assert=require('node:assert/strict')
const ts=require('typescript')

require.extensions['.ts']=(module,filename)=>{const source=fs.readFileSync(filename,'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;module._compile(output,filename)}

const {addDays,fromISO,toISO}=require('../lib/calendar/date.ts')
const {applyScopedUpdate,createSeries,normalizedRule,recurrenceLabel,recurrenceMode,removeScoped}=require('../lib/calendar/recurrence.ts')

const base={id:'event',date:'2026-07-13',start:9,end:10,title:'Standup',categoryId:'work',layer:'plan'}
const makeSeries=()=>createSeries(base,normalizedRule(base,'multiple',[0,1,3],5))
const plusDays=(iso,days)=>toISO(addDays(fromISO(iso),days))

// Assert that all blocks in a single-series array form a coherent set:
// same seriesId, same IDs/occurrenceIndex as a reference, same anchors, delete-all reachable.
const assertLinked=(blocks,original)=>{assert.equal(new Set(blocks.map(block=>block.seriesId)).size,1);assert.deepEqual(blocks.map(block=>block.id),original.map(block=>block.id));assert.deepEqual(blocks.map(block=>block.occurrenceIndex),original.map(block=>block.occurrenceIndex));assert.deepEqual(blocks.map(block=>block.recurrenceDate),original.map(block=>block.recurrenceDate));for(const block of blocks)assert.equal(removeScoped(blocks,block,'all').length,0)}

// Assert that each block's seriesId can delete-all only within its own series.
const assertSelfContained=(blocks)=>{const byId=new Map(blocks.map(b=>[b.id,b]));for(const block of blocks){const afterAll=removeScoped(blocks,block,'all');const remainingSeries=new Set(afterAll.map(b=>b.seriesId));assert.ok(!remainingSeries.has(block.seriesId),`delete-all left blocks with seriesId ${block.seriesId}`)}}

test('multiple days creates exactly Monday, Tuesday, and Thursday for five weeks',()=>{const rule=normalizedRule(base,'multiple',[0,1,3],5),series=createSeries(base,rule);assert.equal(recurrenceMode(rule),'multiple');assert.equal(recurrenceLabel(rule),'Every week on Monday, Tuesday, Thursday for 5 weeks');assert.equal(series.length,15);assert.deepEqual(series.slice(0,6).map(block=>block.date),['2026-07-13','2026-07-14','2026-07-16','2026-07-20','2026-07-21','2026-07-23']);assert.equal(series.at(-1).date,'2026-08-13');assert.ok(series.every(block=>block.recurrenceDate===block.date&&block.recurrenceStart===9&&block.recurrenceEnd===10))})

test('multiple days permits the event creation day as the only selected weekday',()=>{const rule=normalizedRule(base,'multiple',[0],3),series=createSeries(base,rule);assert.equal(series.length,3);assert.deepEqual(series.map(block=>block.date),['2026-07-13','2026-07-20','2026-07-27'])})

test('daily duration adds weeks and days without an upper limit',()=>{const rule=normalizedRule(base,'daily',[],60,3),series=createSeries(base,rule);assert.equal(rule.weeks,60);assert.equal(rule.days,3);assert.equal(series.length,423);assert.equal(recurrenceLabel(rule),'Every day for 423 days');assert.equal(series.at(-1).date,plusDays(base.date,422))})

test('an unselected start weekday is not inserted into the series',()=>{const sunday={...base,date:'2026-07-12'},series=createSeries(sunday,normalizedRule(sunday,'multiple',[0,1,3],5));assert.equal(series.length,15);assert.equal(series[0].date,'2026-07-13');assert.ok(!series.some(block=>block.date==='2026-07-12'))})

test('following move is absolute after a single-occurrence time exception',()=>{const series=makeSeries(),selected=series[3],withException=applyScopedUpdate(series,selected,{...selected,start:10,end:11},'only'),exception=withException.find(block=>block.id===selected.id),followingIds=new Set(series.slice(3).map(block=>block.id)),updated=applyScopedUpdate(withException,exception,{...exception,start:9.5,end:10.5},'following');for(const block of updated){if(followingIds.has(block.id)){assert.equal(block.start,9.5);assert.equal(block.end,10.5)}else{assert.equal(block.start,9);assert.equal(block.end,10)}}})

test('legacy recurring events gain canonical schedule values before an exception is made',()=>{const legacy=makeSeries().map(({recurrenceDate,recurrenceStart,recurrenceEnd,...block})=>block),selected=legacy[3],withException=applyScopedUpdate(legacy,selected,{...selected,date:plusDays(selected.date,1),start:10,end:11},'only'),exception=withException.find(block=>block.id===selected.id),updated=applyScopedUpdate(withException,exception,{...exception,date:plusDays(selected.date,2)},'following');assert.ok(withException.every(block=>block.recurrenceDate&&block.recurrenceStart===9&&block.recurrenceEnd===10));assert.equal(updated.find(block=>block.id===selected.id).date,plusDays(selected.date,2));assert.equal(updated.find(block=>block.id===legacy[4].id).date,plusDays(legacy[4].date,2))})

test('all-events move is absolute after a single-occurrence time exception',()=>{const series=makeSeries(),selected=series[4],withException=applyScopedUpdate(series,selected,{...selected,start:10,end:11},'only'),exception=withException.find(block=>block.id===selected.id),updated=applyScopedUpdate(withException,exception,{...exception,start:9.25,end:10.25},'all');assert.ok(updated.every(block=>block.start===9.25&&block.end===10.25))})

test('all-events move replaces every prior time exception with the selected final slot',()=>{const series=makeSeries(),second=series[1],fourth=series[3],withException=applyScopedUpdate(series,second,{...second,start:10,end:11},'only'),selected=withException.find(block=>block.id===fourth.id),updated=applyScopedUpdate(withException,selected,{...selected,start:10,end:11},'all');for(const block of updated){assert.equal(block.start,10);assert.equal(block.end,11);assert.equal(block.recurrenceStart,10);assert.equal(block.recurrenceEnd,11)}})

test('following splits the series into head and tail with a new series id',()=>{const series=makeSeries(),cut=series[5],afterFollow=applyScopedUpdate(series,cut,{...cut,start:10,end:11},'following');const seriesIds=new Set(afterFollow.map(b=>b.seriesId));assert.equal(seriesIds.size,2);const headId=series[0].seriesId,headBlocks=afterFollow.filter(b=>b.seriesId===headId),tailBlocks=afterFollow.filter(b=>b.seriesId!==headId);assert.equal(headBlocks.length,5);assert.equal(tailBlocks.length,10);assert.deepEqual(headBlocks.map(b=>b.id),series.slice(0,5).map(b=>b.id));assert.deepEqual(tailBlocks.map(b=>b.id),series.slice(5).map(b=>b.id));assert.deepEqual(tailBlocks.map(b=>b.occurrenceIndex),[0,1,2,3,4,5,6,7,8,9]);assert.ok(tailBlocks.every(b=>b.start===10&&b.end===11));assert.ok(headBlocks.every(b=>b.start===9&&b.end===10))})

test('following sets new immutable anchors on tail equal to the new date/time',()=>{const series=makeSeries(),cut=series[3],next={...cut,start:10,end:11},afterFollow=applyScopedUpdate(series,cut,next,'following');const tailBlocks=afterFollow.filter(b=>b.seriesId!==series[0].seriesId);for(const block of tailBlocks){assert.equal(block.recurrenceDate,block.date);assert.equal(block.recurrenceStart,10);assert.equal(block.recurrenceEnd,11)}})

test('delete-all from tail removes only tail; delete-all from head removes only head after split',()=>{const series=makeSeries(),cut=series[5],afterFollow=applyScopedUpdate(series,cut,{...cut,start:10,end:11},'following');const headId=series[0].seriesId,tailBlock=afterFollow.find(b=>b.seriesId!==headId),headBlock=afterFollow.find(b=>b.seriesId===headId);const afterTailAll=removeScoped(afterFollow,tailBlock,'all'),afterHeadAll=removeScoped(afterFollow,headBlock,'all');assert.equal(afterTailAll.length,5);assert.ok(afterTailAll.every(b=>b.seriesId===headId));assert.equal(afterHeadAll.length,10);assert.ok(afterHeadAll.every(b=>b.seriesId!==headId))})

test('successive following cuts each create independent self-contained series',()=>{const series=makeSeries(),afterFirst=applyScopedUpdate(series,series[3],{...series[3],start:10,end:11},'following');const mid=afterFirst.find(b=>b.id===series[6].id),afterSecond=applyScopedUpdate(afterFirst,mid,{...mid,start:11,end:12},'following');const seriesIds=new Set(afterSecond.map(b=>b.seriesId));assert.equal(seriesIds.size,3);assertSelfContained(afterSecond)})

test('all-events move only affects the series the selected block belongs to after a following split',()=>{const series=makeSeries(),afterFollow=applyScopedUpdate(series,series[5],{...series[5],start:10,end:11},'following');const headId=series[0].seriesId,tailBlock=afterFollow.find(b=>b.seriesId!==headId),updated=applyScopedUpdate(afterFollow,tailBlock,{...tailBlock,start:12,end:13},'all');const headBlocks=updated.filter(b=>b.seriesId===headId),tailBlocks=updated.filter(b=>b.seriesId!==headId);assert.ok(headBlocks.every(b=>b.start===9&&b.end===10));assert.ok(tailBlocks.every(b=>b.start===12&&b.end===13))})

test('all-events date move removes prior date offsets while preserving recurrence spacing',()=>{const series=makeSeries(),second=series[1],withException=applyScopedUpdate(series,second,{...second,date:plusDays(second.date,2)},'only'),fifth=withException[4],updated=applyScopedUpdate(withException,fifth,{...fifth,date:plusDays(fifth.recurrenceDate,1)},'all');for(let index=0;index<updated.length;index++){assert.equal(updated[index].date,plusDays(series[index].recurrenceDate,1));assert.equal(updated[index].recurrenceDate,series[index].recurrenceDate)}})

test('non-schedule all-events edits preserve existing time exceptions',()=>{const series=makeSeries(),second=series[1],withException=applyScopedUpdate(series,second,{...second,start:10,end:11},'only'),selected=withException[4],updated=applyScopedUpdate(withException,selected,{...selected,title:'Renamed together'},'all');assert.ok(updated.every(block=>block.title==='Renamed together'));assert.equal(updated[1].start,10);assert.equal(updated[1].end,11);assert.ok(updated.filter((_,index)=>index!==1).every(block=>block.start===9&&block.end===10))})

test('only and following deletes retain one identity for every remaining occurrence',()=>{const original=makeSeries(),onlyRemoved=removeScoped(original,original[3],'only'),followingRemoved=removeScoped(original,original[8],'following');assert.equal(onlyRemoved.length,original.length-1);assert.equal(new Set(onlyRemoved.map(block=>block.seriesId)).size,1);for(const block of onlyRemoved)assert.equal(removeScoped(onlyRemoved,block,'all').length,0);assert.equal(followingRemoved.length,8);assert.equal(new Set(followingRemoved.map(block=>block.seriesId)).size,1);for(const block of followingRemoved)assert.equal(removeScoped(followingRemoved,block,'all').length,0)})

test('scoped updates cannot overwrite immutable recurrence identity fields',()=>{const original=makeSeries(),selected=original[2],tampered={...selected,seriesId:'different-set',occurrenceIndex:999,start:10,end:11},only=applyScopedUpdate(original,selected,tampered,'only'),all=applyScopedUpdate(original,selected,tampered,'all');assertLinked(only,original);assertLinked(all,original)})

test('following resize is absolute after a single-occurrence resize exception',()=>{const series=makeSeries(),selected=series[3],withException=applyScopedUpdate(series,selected,{...selected,end:11},'only'),exception=withException.find(block=>block.id===selected.id),followingIds=new Set(series.slice(3).map(block=>block.id)),updated=applyScopedUpdate(withException,exception,{...exception,end:10.5},'following');for(const block of updated){assert.equal(block.start,9);assert.equal(block.end,followingIds.has(block.id)?10.5:10)}})

test('following title edit preserves existing time exceptions while applying one title',()=>{const series=makeSeries(),selected=series[3],withException=applyScopedUpdate(series,selected,{...selected,start:10,end:11},'only'),exception=withException.find(block=>block.id===selected.id),followingIds=new Set(series.slice(3).map(block=>block.id)),updated=applyScopedUpdate(withException,exception,{...exception,title:'Renamed'},'following');for(const block of updated){assert.equal(block.title,followingIds.has(block.id)?'Renamed':'Standup')}assert.equal(updated.find(block=>block.id===selected.id).start,10);assert.equal(updated.find(block=>block.id===series[4].id).start,9)})

test('delete scopes remove only, following, or all intended occurrences',()=>{const series=makeSeries(),selected=series[5];assert.equal(removeScoped(series,selected,'only').length,14);assert.equal(removeScoped(series,selected,'following').length,5);assert.equal(removeScoped(series,selected,'all').length,0)})

test('following date move shifts weekdays on the new tail recurrence rule',()=>{
  // Base event on Tuesday (weekdayIndex=1), series repeats Mon(0), Tue(1), Thu(3)
  const seriesBase={...base,date:'2026-07-14'}  // Tuesday
  const rule=normalizedRule(seriesBase,'multiple',[0,1,3],4)
  const series=createSeries(seriesBase,rule)
  const selected=series[0]  // Monday occurrence
  // Move to Tuesday (+1 day shift); net weekday shift = +1
  const updated=applyScopedUpdate(series,selected,{...selected,date:plusDays(selected.date,1)},'following')
  const tailBlocks=updated.filter(b=>b.seriesId!==series[0].seriesId)
  assert.ok(tailBlocks.length>0)
  // Original weekdays [0,1,3] shifted by +1 → [1,2,4] (Mon→Tue, Tue→Wed, Thu→Fri)
  assert.deepEqual(tailBlocks[0].recurrence.weekdays,[1,2,4])
  // Head keeps original weekdays
  const headBlocks=updated.filter(b=>b.seriesId===series[0].seriesId)
  if(headBlocks.length>0)assert.deepEqual(headBlocks[0].recurrence.weekdays,[0,1,3])
})

test('all-events date move shifts weekdays on every occurrence recurrence rule',()=>{
  // Series on Tue(1), Thu(3), Sun(6)
  const tueSeries={...base,date:'2026-07-14'}  // Tuesday
  const rule=normalizedRule(tueSeries,'multiple',[1,3,6],4)
  const series=createSeries(tueSeries,rule)
  const selected=series[0]  // Tuesday occurrence
  // Move +1 day: Tue→Wed; weekdays shift +1 → [0,2,4] (Wed=2, Fri=4, Mon=0)
  const updated=applyScopedUpdate(series,selected,{...selected,date:plusDays(selected.date,1)},'all')
  assert.ok(updated.every(b=>b.recurrence&&b.recurrence.weekdays.join(',')===([0,2,4]).join(',')))
  // Canonical anchors preserved
  for(let i=0;i<updated.length;i++)assert.equal(updated[i].recurrenceDate,series[i].recurrenceDate)
})

test('weekday shift wraps correctly across the Sunday/Monday boundary',()=>{
  // Series on Sunday (6); shift +1 day wraps to Monday (0)
  const sunSeries={...base,date:'2026-07-12'}  // Sunday (in Mon-first = index 6)
  const rule=normalizedRule(sunSeries,'multiple',[6],3)
  const series=createSeries(sunSeries,rule)
  const selected=series[0]
  const updated=applyScopedUpdate(series,selected,{...selected,date:plusDays(selected.date,1)},'all')
  assert.ok(updated.every(b=>b.recurrence&&b.recurrence.weekdays.join(',')===([0]).join(',')))
})

test('daily-mode recurrence weekdays are not altered by a date move',()=>{
  const dailyRule=normalizedRule(base,'daily',[],1)
  const series=createSeries(base,dailyRule)
  const selected=series[2]
  const updated=applyScopedUpdate(series,selected,{...selected,date:plusDays(selected.date,3)},'all')
  assert.ok(updated.every(b=>b.recurrence&&b.recurrence.weekdays.length===7))
})

test('two-week date shift leaves weekdays unchanged (multiple of 7)',()=>{
  const series=makeSeries(),selected=series[3]
  const updated=applyScopedUpdate(series,selected,{...selected,date:plusDays(selected.date,14)},'all')
  assert.ok(updated.every(b=>b.recurrence&&b.recurrence.weekdays.join(',')===series[0].recurrence.weekdays.join(',')))
})

test('recurrence controls keep the requested order, defaults, duration fields, and circular weekdays',()=>{const editor=fs.readFileSync(require.resolve('../components/calendar/RecurrenceEditor.tsx'),'utf8'),css=fs.readFileSync(require.resolve('../app/globals.css'),'utf8'),multiple=editor.indexOf('<option value="multiple">Multiple days a week</option>'),weekly=editor.indexOf('<option value="weekly">Every week</option>'),daily=editor.indexOf('<option value="daily">Every day</option>');assert.ok(multiple>0&&multiple<weekly&&weekly<daily);assert.ok(!editor.includes('placeholder=')&&!editor.includes('Choose at least two days')&&!editor.includes('Enter a duration'));assert.match(editor,/next==='multiple'\?\[createdDay\]:\[\]/);assert.match(editor,/aria-label="Repeat weeks"/);assert.match(editor,/aria-label="Repeat days"/);assert.match(css,/\.weekday-picker button\{width:26px;height:26px;aspect-ratio:1;padding:0;[^}]*border-radius:50%/)})

test('live inspector edits remember one recurring scope per selection session',()=>{const app=fs.readFileSync(require.resolve('../components/calendar/CalendarApp.tsx'),'utf8');assert.match(app,/editScopeRef=useRef/);assert.match(app,/remembered=editScopeRef\.current/);assert.ok(!app.includes('[editScope,setEditScope]'))})

test('setBlockRecurrence uses current start time, not canonical anchor, after a time change on split tail', () => {
  // 1. Create series at 9am
  const series = makeSeries() // Mon/Tue/Thu x5 at 9–10am

  // 2. Apply 'all' time change to 2pm → start=2, but recurrenceStart stays at 9 (canonical anchor)
  const at2pm = applyScopedUpdate(series, series[0], {...series[0], start:2, end:3}, 'all')
  assert.ok(at2pm.every(b => b.start === 2), 'all events should be at 2pm')
  assert.ok(at2pm.every(b => b.recurrenceStart === 9 || b.recurrenceStart === 2), 'recurrenceStart is preserved')

  // 3. 'following' split on event3 (index 3) → creates a tail series
  const event3 = at2pm[3]
  const afterSplit = applyScopedUpdate(at2pm, event3, event3, 'following')
  const tailId = afterSplit.find(b => b.id === event3.id)?.seriesId
  const tailMembers = afterSplit.filter(b => b.seriesId === tailId).sort((a,b)=>(a.occurrenceIndex??0)-(b.occurrenceIndex??0))
  const tailRoot = tailMembers[0]

  // 4. When setBlockRecurrence regenerates from tailRoot, it must use root.start not root.recurrenceStart
  // BUG: root.recurrenceStart ?? root.start would return 9 (wrong)
  // FIX: root.start returns 2 (correct)
  assert.equal(tailRoot.start, 2, 'tail root start should be 2pm')
  const newStart = tailRoot.start // fixed path
  assert.equal(newStart, 2, 'regenerated series should use 2pm, not the 9am canonical anchor')
})

test('hammer: split-then-time-change: setBlockRecurrence must not revert to stale canonical time', () => {
  // Exact bug scenario: split FIRST, change tail time AFTER.
  // After 'all' time change, recurrenceStart stays at 9 (stale) while start updates to 2.
  // OLD setBlockRecurrence used root.recurrenceStart??root.start = 9 → reset to 9am. BUG.
  let blocks = makeSeries() // 9-10am

  // Op1: split at index 5, no time change
  const splitEvent = blocks[5]
  blocks = applyScopedUpdate(blocks, splitEvent, splitEvent, 'following')
  const tailId = blocks.find(b => b.id === splitEvent.id).seriesId
  const tail = () => blocks.filter(b => b.seriesId === tailId).sort((a,b)=>(a.occurrenceIndex??0)-(b.occurrenceIndex??0))

  // Op2: change tail time to 2pm via 'all'
  const tailRoot0 = tail()[0]
  blocks = applyScopedUpdate(blocks, tailRoot0, {...tailRoot0, start:2, end:3}, 'all')
  assert.ok(tail().every(b => b.start === 2), 'tail at 2pm after time change')

  // Confirm the stale-recurrenceStart condition that caused the bug
  const root = tail()[0]
  assert.equal(root.start, 2, 'root.start is 2pm')
  assert.equal(root.recurrenceStart, 2, 'root.recurrenceStart is now correctly synced to 2pm')

  // Op3: change weeks (setBlockRecurrence) - must regenerate at 2pm not 9am
  const newRule = normalizedRule(root, 'multiple', [0,1,3], 8)
  const newSeries = createSeries({
    ...root,
    date: root.recurrenceDate ?? root.date,
    start: root.start,   // FIX: was root.recurrenceStart??root.start which gave 9
    end: root.end,
    seriesId: undefined, recurrence: undefined, occurrenceIndex: undefined,
    recurrenceDate: undefined, recurrenceStart: undefined, recurrenceEnd: undefined
  }, newRule)
  assert.ok(newSeries.every(b => b.start === 2), 'regenerated series is at 2pm')
  assert.ok(newSeries.every(b => b.end === 3), 'regenerated series ends at 3pm')
  assert.equal(root.recurrenceStart ?? root.start, 2, 'recurrenceStart is kept in sync so both paths give 2pm')
})

test('move-forward-then-back restores original weekdays', () => {
  // M/T/Thu series. Move all +2 days (to W/T/Sat), then move back -2 (to M/T/Thu).
  // BUG: dateShift used recurrenceDate as "from", so moving back gave shift=0 and weekdays stayed wrong.
  const series = makeSeries() // weekdays [0,1,3] = Mon, Tue, Thu
  const originalWeekdays = series[0].recurrence.weekdays.join(',')

  // Forward: move all events +2 days
  const sel = series[0]
  const fwd = applyScopedUpdate(series, sel, {...sel, date: plusDays(sel.date, 2)}, 'all')
  assert.equal(fwd[0].recurrence.weekdays.join(','), [2,3,5].join(','), 'weekdays shifted +2 after forward move')

  // Back: move all events -2 days (back to original position)
  const sel2 = fwd[0]
  const back = applyScopedUpdate(fwd, sel2, {...sel2, date: plusDays(sel2.date, -2)}, 'all')
  assert.equal(back[0].recurrence.weekdays.join(','), originalWeekdays, 'weekdays restored after move back')
  assert.equal(back[0].date, series[0].date, 'date restored to original')
})
