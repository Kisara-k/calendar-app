const fs=require('node:fs')
const test=require('node:test')
const assert=require('node:assert/strict')
const ts=require('typescript')

require.extensions['.ts']=(module,filename)=>{const source=fs.readFileSync(filename,'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;module._compile(output,filename)}

const {overlapLayout}=require('../lib/calendar/layout.ts')
const {monthEventLayout,monthEventPriority}=require('../lib/calendar/month-layout.ts')
const order=new Map([['work',0]])
const block=(id,start,end)=>({id,date:'2026-07-15',start,end,title:id,categoryId:'work',layer:'plan'})

test('shorter events overlay a long event without narrowing it',()=>{const layout=overlapLayout([block('sleep',8.5,15.75),block('call',12,12.25),block('break',14.5,14.75)],order);assert.deepEqual(layout.get('sleep'),{left:0,width:100,overlay:false});assert.deepEqual(layout.get('call'),{left:4,width:96,overlay:true});assert.deepEqual(layout.get('break'),{left:4,width:96,overlay:true})})

test('identical overlapping events continue to share columns',()=>{const layout=overlapLayout([block('one',9,11),block('two',9,11)],order);assert.deepEqual(layout.get('one'),{left:0,width:50,overlay:false});assert.deepEqual(layout.get('two'),{left:50,width:50,overlay:false})})

test('simultaneous shorter overlays receive separate lanes',()=>{const layout=overlapLayout([block('base',8,12),block('one',9,9.25),block('two',9,9.25)],order);assert.deepEqual(layout.get('one'),{left:4,width:48,overlay:true});assert.deepEqual(layout.get('two'),{left:52,width:48,overlay:true})})

test('equal short events share columns when no longer event sits behind them',()=>{const layout=overlapLayout([block('one',9,9.25),block('two',9,9.25)],order);assert.deepEqual(layout.get('one'),{left:0,width:50,overlay:false});assert.deepEqual(layout.get('two'),{left:50,width:50,overlay:false})})

test('an event overlapping exactly 0.75x of the background event overlays it',()=>{const layout=overlapLayout([block('background',9,11),block('foreground',9.5,12)],order);assert.deepEqual(layout.get('background'),{left:0,width:100,overlay:false});assert.deepEqual(layout.get('foreground'),{left:4,width:96,overlay:true})})

test('an event overlapping more than 0.75x of the background event shares a column',()=>{const layout=overlapLayout([block('background',9,11),block('peer',9.49,12)],order);assert.deepEqual(layout.get('background'),{left:0,width:50,overlay:false});assert.deepEqual(layout.get('peer'),{left:50,width:50,overlay:false})})

test('overlay eligibility ignores total duration when the actual intersection is small',()=>{const layout=overlapLayout([block('operational-research',4,6),block('gavel',5.5,8)],order);assert.deepEqual(layout.get('operational-research'),{left:0,width:100,overlay:false});assert.deepEqual(layout.get('gavel'),{left:4,width:96,overlay:true})})

test('month event rows expand with cell height and reserve room for overflow',()=>{assert.deepEqual(monthEventLayout(75,2),{visible:2,showMore:false});assert.deepEqual(monthEventLayout(75,5),{visible:1,showMore:true});assert.deepEqual(monthEventLayout(150,5),{visible:5,showMore:false});assert.deepEqual(monthEventLayout(150,8),{visible:5,showMore:true})})

test('month event rows do not render controls that cannot fit',()=>{assert.deepEqual(monthEventLayout(40,3),{visible:0,showMore:false})})

test('month priority keeps all-day events unique and places favorite timed events next',()=>{const favorites=new Set(['favorite']),events=[{id:'normal',allDay:false,categoryId:'normal'},{id:'favorite',allDay:false,categoryId:'favorite'},{id:'favorite-all-day',allDay:true,categoryId:'favorite'}];const sorted=[...events].sort((a,b)=>monthEventPriority(a.allDay,a.categoryId,favorites)-monthEventPriority(b.allDay,b.categoryId,favorites));assert.deepEqual(sorted.map(event=>event.id),['favorite-all-day','favorite','normal']);assert.equal(new Set(sorted.map(event=>event.id)).size,events.length)})
