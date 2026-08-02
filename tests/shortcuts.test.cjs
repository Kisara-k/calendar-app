const fs=require('node:fs')
const test=require('node:test')
const assert=require('node:assert/strict')
const ts=require('typescript')

require.extensions['.ts']=(module,filename)=>{const source=fs.readFileSync(filename,'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;module._compile(output,filename)}

const {defaultShortcuts,eventMatchesShortcut,formatShortcut,normalizeShortcutOverrides,resolveShortcuts,shortcutDefinitions,shortcutFromKeyboardEvent,withShortcutOverride}=require('../lib/calendar/shortcuts.ts')

const keyEvent=(code,options={})=>({code,key:'',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...options})

test('every shortcut command has a unique default',()=>{const defaults=shortcutDefinitions.map(definition=>definition.defaultShortcut);assert.equal(new Set(defaults).size,defaults.length);assert.equal(shortcutDefinitions.length,Object.keys(defaultShortcuts).length)})

test('command menu actions that were previously unassigned have defaults',()=>{assert.equal(defaultShortcuts.todos,'Shift+KeyT');assert.equal(defaultShortcuts.settings,'Mod+Comma')})

test('command menu links directly to the keyboard shortcut editor',()=>{const app=fs.readFileSync(require.resolve('../components/calendar/CalendarApp.tsx'),'utf8');assert.ok(app.includes("label:'Edit keyboard shortcuts',hint:hint('shortcuts')"));assert.ok(app.includes("run:()=>showUtility('shortcuts')"))})

test('keyboard events normalize Ctrl and Command to the portable Mod token',()=>{assert.equal(shortcutFromKeyboardEvent(keyEvent('KeyK',{ctrlKey:true})),'Mod+KeyK');assert.equal(shortcutFromKeyboardEvent(keyEvent('KeyK',{metaKey:true})),'Mod+KeyK');assert.ok(eventMatchesShortcut(keyEvent('Slash',{shiftKey:true}),'Shift+Slash'))})

test('overrides can customize, disable, and reset a shortcut',()=>{let overrides=withShortcutOverride(undefined,'today','KeyG');assert.equal(resolveShortcuts(overrides).today,'KeyG');overrides=withShortcutOverride(overrides,'today',null);assert.equal(resolveShortcuts(overrides).today,null);overrides=withShortcutOverride(overrides,'today',defaultShortcuts.today);assert.equal(resolveShortcuts(overrides).today,defaultShortcuts.today)})

test('invalid imported overrides are ignored and shortcut labels use platform-aware text',()=>{assert.deepEqual(normalizeShortcutOverrides({today:'',settings:'Mod+Comma',search:null,unknown:'KeyX'}),{search:null});assert.equal(formatShortcut('Mod+Shift+KeyK',false),'Ctrl + Shift + K');assert.equal(formatShortcut('Mod+Shift+KeyK',true),'Cmd + Shift + K')})

test('recording exits on outside pointer input and uses the shared accent without boxed controls',()=>{const component=fs.readFileSync(require.resolve('../components/calendar/ShortcutsPanel.tsx'),'utf8'),css=fs.readFileSync(require.resolve('../app/globals.css'),'utf8');assert.ok(component.includes("document.addEventListener('pointerdown',cancel,true)"));assert.ok(component.includes('current===definition.id?null:definition.id'));assert.ok(css.includes('.shortcut-recorder{min-width:78px;height:24px;border:0;background:transparent'));assert.ok(css.includes('.shortcut-row.recording{border-bottom-color:var(--accent-border)}'));assert.ok(!css.includes('#7468be')&&!css.includes('#8b7dd3'))})
