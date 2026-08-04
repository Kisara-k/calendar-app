const fs=require('node:fs')
const test=require('node:test')
const assert=require('node:assert/strict')
const ts=require('typescript')

require.extensions['.ts']=(module,filename)=>{const source=fs.readFileSync(filename,'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;module._compile(output,filename)}

const {emptySnapshotHistory,recordSnapshot,undoSnapshot,redoSnapshot}=require('../lib/calendar/history.ts')

test('Enter creation and indentation each consume exactly one undo entry',()=>{const original=[{id:'source',title:'Source'}],created=[...original,{id:'blank',title:''}],indented=[original[0],{...created[1],parentId:'source'}];let current=original,history=emptySnapshotHistory();history=recordSnapshot(history,current,50);current=created;history=recordSnapshot(history,current,50);current=indented;const undoIndent=undoSnapshot(history,current,50);assert.deepEqual(undoIndent.current,created);assert.equal(undoIndent.history.past.length,1);const undoCreation=undoSnapshot(undoIndent.history,undoIndent.current,50);assert.deepEqual(undoCreation.current,original);assert.equal(undoCreation.history.past.length,0);const redoCreation=redoSnapshot(undoCreation.history,undoCreation.current,50);assert.deepEqual(redoCreation.current,created)})

test('calendar history never mutates other state from inside a React state updater',()=>{const store=fs.readFileSync(require.resolve('../hooks/useCalendarStore.ts'),'utf8'),commit=store.slice(store.indexOf('const commit = useCallback'),store.indexOf('const addBlock = useCallback'));assert.ok(commit.includes('const current=dataRef.current,next=change(current)'));assert.ok(commit.includes('publishHistory(recordSnapshot(historyRef.current,current,HISTORY_LIMIT))'));assert.ok(!commit.includes('setData((current)'));assert.ok(!commit.includes('setPast((items)'));assert.ok(!commit.includes('setFuture((items)'))})
