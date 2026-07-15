const fs=require('node:fs')
const test=require('node:test')
const assert=require('node:assert/strict')
const ts=require('typescript')

require.extensions['.ts']=(module,filename)=>{const source=fs.readFileSync(filename,'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;module._compile(output,filename)}

const {overlapLayout}=require('../lib/calendar/layout.ts')
const order=new Map([['work',0]])
const block=(id,start,end)=>({id,date:'2026-07-15',start,end,title:id,categoryId:'work',layer:'plan'})

test('shorter events overlay a long event without narrowing it',()=>{const layout=overlapLayout([block('sleep',8.5,15.75),block('call',12,12.25),block('break',14.5,14.75)],order);assert.deepEqual(layout.get('sleep'),{left:0,width:100,overlay:false});assert.deepEqual(layout.get('call'),{left:4,width:96,overlay:true});assert.deepEqual(layout.get('break'),{left:4,width:96,overlay:true})})

test('equal overlapping events continue to share columns',()=>{const layout=overlapLayout([block('one',9,11),block('two',10,12)],order);assert.deepEqual(layout.get('one'),{left:0,width:50,overlay:false});assert.deepEqual(layout.get('two'),{left:50,width:50,overlay:false})})

test('simultaneous shorter overlays receive separate lanes',()=>{const layout=overlapLayout([block('base',8,12),block('one',9,9.25),block('two',9,9.25)],order);assert.deepEqual(layout.get('one'),{left:4,width:48,overlay:true});assert.deepEqual(layout.get('two'),{left:52,width:48,overlay:true})})

test('equal short events share columns when no longer event sits behind them',()=>{const layout=overlapLayout([block('one',9,9.25),block('two',9,9.25)],order);assert.deepEqual(layout.get('one'),{left:0,width:50,overlay:false});assert.deepEqual(layout.get('two'),{left:50,width:50,overlay:false})})

test('an event exactly 0.75x as long overlays the longer event',()=>{const layout=overlapLayout([block('long',9,11),block('shorter',9,10.5)],order);assert.deepEqual(layout.get('long'),{left:0,width:100,overlay:false});assert.deepEqual(layout.get('shorter'),{left:4,width:96,overlay:true})})

test('an event more than 0.75x as long shares a column',()=>{const layout=overlapLayout([block('long',9,11),block('peer',9,10.51)],order);assert.deepEqual(layout.get('long'),{left:0,width:50,overlay:false});assert.deepEqual(layout.get('peer'),{left:50,width:50,overlay:false})})
