const fs=require('node:fs')
const test=require('node:test')
const assert=require('node:assert/strict')
const ts=require('typescript')

require.extensions['.ts']=(module,filename)=>{const source=fs.readFileSync(filename,'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;module._compile(output,filename)}

const {differenceInCalendarDays,formatTime,startOfWeek,toISO,weekDates,weekDayOrder}=require('../lib/calendar/date.ts')
const {blockTimeOnDate,endClockTime,timedBlockSegments}=require('../lib/calendar/block-time.ts')

test('start of week supports every day from Monday through Sunday',()=>{const anchor=new Date(2026,6,16);for(let day=0;day<7;day++){const start=startOfWeek(anchor,day);assert.equal((start.getDay()+6)%7,day);assert.ok(start<=anchor);assert.ok((anchor-start)/(24*60*60*1000)<7)}})

test('week dates rotate from the chosen start day',()=>{assert.deepEqual(weekDates(new Date(2026,6,16),true,4).map(toISO),['2026-07-10','2026-07-11','2026-07-12','2026-07-13','2026-07-14','2026-07-15','2026-07-16']);assert.deepEqual(weekDayOrder(4),[4,5,6,0,1,2,3])})

test('hidden weekends exclude Saturday and Sunday after rotation',()=>{const dates=weekDates(new Date(2026,6,16),false,4);assert.deepEqual(dates.map(date=>(date.getDay()+6)%7),[4,0,1,2,3]);assert.ok(dates.every(date=>date.getDay()!==0&&date.getDay()!==6))})

test('calendar-day differences preserve the weekend gap in a filtered week',()=>{const dates=weekDates(new Date(2026,6,16),false,4);assert.equal(differenceInCalendarDays(dates[1],dates[0]),3)})

test('cross-midnight events split into display segments without becoming separate events',()=>{const segments=timedBlockSegments({date:'2026-07-19',start:23,end:25});assert.deepEqual(segments,[{date:'2026-07-19',start:23,end:24,dayOffset:0,first:true,last:false},{date:'2026-07-20',start:0,end:1,dayOffset:1,first:false,last:true}])})

test('calendar positions convert to hours relative to an event start date',()=>{assert.equal(blockTimeOnDate('2026-07-19','2026-07-20',1),25);assert.equal(blockTimeOnDate('2026-07-17','2026-07-20',1),73)})

test('times beyond midnight format as next-day clock times',()=>{assert.equal(endClockTime(25),1);assert.equal(formatTime(25,'12h'),'1:00 AM');assert.equal(formatTime(25,'24h'),'01:00')})
