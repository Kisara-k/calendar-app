const fs=require('node:fs')
const test=require('node:test')
const assert=require('node:assert/strict')
const ts=require('typescript')

require.extensions['.ts']=(module,filename)=>{const source=fs.readFileSync(filename,'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;module._compile(output,filename)}

const {defaultShortcuts,eventMatchesShortcut,formatShortcut,normalizeShortcutOverrides,resolveShortcuts,shortcutDefinitions,shortcutFromKeyboardEvent,withShortcutOverride}=require('../lib/calendar/shortcuts.ts')

const keyEvent=(code,options={})=>({code,key:'',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...options})

test('every shortcut command has a unique default',()=>{const defaults=shortcutDefinitions.map(definition=>definition.defaultShortcut);assert.equal(new Set(defaults).size,defaults.length);assert.equal(shortcutDefinitions.length,Object.keys(defaultShortcuts).length)})

test('command menu actions that were previously unassigned have defaults',()=>{assert.equal(defaultShortcuts.todos,'Shift+KeyT');assert.equal(defaultShortcuts.settings,'Mod+Comma')})

test('command menu links directly to the keyboard shortcut editor',()=>{const app=fs.readFileSync(require.resolve('../components/calendar/CalendarApp.tsx'),'utf8');assert.ok(app.includes("label:'Keyboard shortcuts',hint:hint('shortcuts')"));assert.ok(app.includes("run:()=>showUtility('shortcuts')"))})

test('dismissible shortcut surfaces toggle while state-setting commands do not',()=>{const app=fs.readFileSync(require.resolve('../components/calendar/CalendarApp.tsx'),'utf8');assert.ok(app.includes("case'commandMenu':setCommandOpen(current=>!current)"));for(const panel of ['shortcuts','todos','search','settings'])assert.ok(app.includes(`case'${panel}':toggleUtility('${panel}')`));assert.ok(app.includes("case'insights':showUtility('insights')"));assert.ok(app.includes("if(activePanel===next){if(next==='todos')setLinkingTodoId(null);setUtilityPanel(null);return}"))})

test('keyboard events normalize Ctrl and Command to the portable Mod token',()=>{assert.equal(shortcutFromKeyboardEvent(keyEvent('KeyK',{ctrlKey:true})),'Mod+KeyK');assert.equal(shortcutFromKeyboardEvent(keyEvent('KeyK',{metaKey:true})),'Mod+KeyK');assert.ok(eventMatchesShortcut(keyEvent('Slash',{shiftKey:true}),'Shift+Slash'))})

test('overrides can customize, disable, and reset a shortcut',()=>{let overrides=withShortcutOverride(undefined,'today','KeyG');assert.equal(resolveShortcuts(overrides).today,'KeyG');overrides=withShortcutOverride(overrides,'today',null);assert.equal(resolveShortcuts(overrides).today,null);overrides=withShortcutOverride(overrides,'today',defaultShortcuts.today);assert.equal(resolveShortcuts(overrides).today,defaultShortcuts.today)})

test('invalid imported overrides are ignored and shortcut labels use platform-aware text',()=>{assert.deepEqual(normalizeShortcutOverrides({today:'',settings:'Mod+Comma',search:null,unknown:'KeyX'}),{search:null});assert.equal(formatShortcut('Mod+Shift+KeyK',false),'Ctrl + Shift + K');assert.equal(formatShortcut('Mod+Shift+KeyK',true),'Cmd + Shift + K')})

test('recording exits on outside pointer input and underlines only the compact transparent hotkey',()=>{const component=fs.readFileSync(require.resolve('../components/calendar/ShortcutsPanel.tsx'),'utf8'),css=fs.readFileSync(require.resolve('../app/globals.css'),'utf8');assert.ok(component.includes("document.addEventListener('pointerdown',cancel,true)"));assert.ok(component.includes('current===definition.id?null:definition.id'));assert.ok(component.includes('<span className="shortcut-value">'));assert.ok(!component.includes('<kbd>'));assert.ok(css.includes('.shortcut-list h3{height:24px'));assert.ok(css.includes('.shortcut-row{min-height:20px'));assert.ok(css.includes('.shortcut-row>div small{color:var(--accent)'));assert.ok(css.includes('.shortcut-recorder{box-sizing:border-box;min-width:64px;height:16px;border:0;background:transparent!important;color:inherit'));assert.ok(css.includes('.shortcut-recorder:hover,.shortcut-recorder:focus,.shortcut-recorder:focus-visible,.shortcut-recorder:active{background:transparent!important}'));assert.ok(css.includes('.shortcut-value{display:inline;max-width:100%;overflow:hidden;background:transparent!important;border:0!important;box-shadow:none!important'));assert.ok(!css.includes('.shortcut-recorder{all:unset'));assert.ok(css.includes('.shortcut-row.recording .shortcut-recorder{box-shadow:inset 0 -1px var(--accent)}'));assert.ok(css.includes('.shortcut-row.recording .shortcut-value{color:var(--accent-muted);text-decoration:none}'));assert.ok(!css.includes('.shortcut-row.recording{border-bottom-color:'));assert.ok(!css.includes('#7468be')&&!css.includes('#8b7dd3'))})
