import type { KeyboardShortcutOverrides, ShortcutId } from './types'

export type ShortcutGroup = 'General' | 'Editing' | 'Navigation' | 'Views & panels'
export type ShortcutDefinition = { id:ShortcutId; label:string; group:ShortcutGroup; defaultShortcut:string; allowInEditable?:boolean }

export const shortcutDefinitions:ShortcutDefinition[]=[
  {id:'commandMenu',label:'Command menu',group:'General',defaultShortcut:'Mod+KeyK',allowInEditable:true},
  {id:'newBlock',label:'Create new block',group:'General',defaultShortcut:'KeyN'},
  {id:'shortcuts',label:'Keyboard shortcuts',group:'General',defaultShortcut:'Shift+Slash'},
  {id:'closeClear',label:'Close or clear selection',group:'General',defaultShortcut:'Escape'},
  {id:'duplicateSelected',label:'Duplicate selected',group:'Editing',defaultShortcut:'Mod+KeyD'},
  {id:'copySelected',label:'Copy selected',group:'Editing',defaultShortcut:'Mod+KeyC'},
  {id:'pasteBlocks',label:'Paste blocks',group:'Editing',defaultShortcut:'Mod+KeyV'},
  {id:'selectCalendarBlocks',label:'Select matching blocks',group:'Editing',defaultShortcut:'Mod+KeyA'},
  {id:'deleteSelected',label:'Delete selected',group:'Editing',defaultShortcut:'Delete'},
  {id:'undo',label:'Undo',group:'Editing',defaultShortcut:'Mod+KeyZ',allowInEditable:true},
  {id:'redo',label:'Redo',group:'Editing',defaultShortcut:'Mod+Shift+KeyZ',allowInEditable:true},
  {id:'today',label:'Go to today',group:'Navigation',defaultShortcut:'KeyT'},
  {id:'previousRange',label:'Previous range',group:'Navigation',defaultShortcut:'ArrowLeft'},
  {id:'nextRange',label:'Next range',group:'Navigation',defaultShortcut:'ArrowRight'},
  {id:'previousDay',label:'Previous day',group:'Navigation',defaultShortcut:'Shift+ArrowLeft'},
  {id:'nextDay',label:'Next day',group:'Navigation',defaultShortcut:'Shift+ArrowRight'},
  {id:'dayView',label:'Day view',group:'Views & panels',defaultShortcut:'KeyD'},
  {id:'weekView',label:'Week view',group:'Views & panels',defaultShortcut:'KeyW'},
  {id:'monthView',label:'Month view',group:'Views & panels',defaultShortcut:'KeyM'},
  {id:'actualLayer',label:'Switch to Actual',group:'Views & panels',defaultShortcut:'Digit1'},
  {id:'planLayer',label:'Switch to Plan',group:'Views & panels',defaultShortcut:'Digit2'},
  {id:'todos',label:'Open to-do list',group:'Views & panels',defaultShortcut:'Shift+KeyT'},
  {id:'insights',label:'Show weekly insights',group:'Views & panels',defaultShortcut:'KeyI'},
  {id:'search',label:'Search blocks',group:'Views & panels',defaultShortcut:'Slash'},
  {id:'settings',label:'Open settings',group:'Views & panels',defaultShortcut:'Mod+Comma',allowInEditable:true},
]

export const shortcutDefinitionById=new Map(shortcutDefinitions.map(definition=>[definition.id,definition]))
export const defaultShortcuts=Object.fromEntries(shortcutDefinitions.map(definition=>[definition.id,definition.defaultShortcut])) as Record<ShortcutId,string>

const modifierCodes=new Set(['AltLeft','AltRight','ControlLeft','ControlRight','MetaLeft','MetaRight','ShiftLeft','ShiftRight'])
const modifierTokens=new Set(['Mod','Alt','Shift'])
const keyAliases:Record<string,string>={
  ' ':'Space',',':'Comma','.':'Period','/':'Slash','\\':'Backslash',';':'Semicolon',"'":'Quote','[':'BracketLeft',']':'BracketRight','-':'Minus','=':'Equal','`':'Backquote',
}

function fallbackCode(key:string){if(keyAliases[key])return keyAliases[key];if(key.length===1&&/[a-z]/i.test(key))return`Key${key.toUpperCase()}`;if(key.length===1&&/\d/.test(key))return`Digit${key}`;return key}
function isValidShortcut(value:string){const parts=value.split('+'),key=parts.pop();return!!key&&!modifierTokens.has(key)&&parts.every((part,index)=>modifierTokens.has(part)&&parts.indexOf(part)===index)}

export function shortcutFromKeyboardEvent(event:Pick<KeyboardEvent,'altKey'|'code'|'ctrlKey'|'key'|'metaKey'|'shiftKey'>){const code=event.code||fallbackCode(event.key);if(!code||modifierCodes.has(code))return null;const parts:string[]=[];if(event.ctrlKey||event.metaKey)parts.push('Mod');if(event.altKey)parts.push('Alt');if(event.shiftKey)parts.push('Shift');parts.push(code);return parts.join('+')}
export function eventMatchesShortcut(event:Pick<KeyboardEvent,'altKey'|'code'|'ctrlKey'|'key'|'metaKey'|'shiftKey'>,shortcut:string|null){return!!shortcut&&shortcutFromKeyboardEvent(event)===shortcut}
export function resolveShortcuts(overrides?:KeyboardShortcutOverrides){return Object.fromEntries(shortcutDefinitions.map(definition=>[definition.id,overrides?.[definition.id]===undefined?definition.defaultShortcut:overrides[definition.id]])) as Record<ShortcutId,string|null>}
export function normalizeShortcutOverrides(value:unknown):KeyboardShortcutOverrides|undefined{if(!value||typeof value!=='object'||Array.isArray(value))return undefined;const candidate=value as Record<string,unknown>,normalized:KeyboardShortcutOverrides={};shortcutDefinitions.forEach(({id,defaultShortcut})=>{const shortcut=candidate[id];if(shortcut===null)normalized[id]=null;else if(typeof shortcut==='string'&&isValidShortcut(shortcut)&&shortcut!==defaultShortcut)normalized[id]=shortcut});return Object.keys(normalized).length?normalized:undefined}
export function withShortcutOverride(current:KeyboardShortcutOverrides|undefined,id:ShortcutId,shortcut:string|null){const next={...(current??{})};if(shortcut===defaultShortcuts[id])delete next[id];else next[id]=shortcut;return Object.keys(next).length?next:undefined}
export function isMacShortcutPlatform(){return typeof navigator!=='undefined'&&/Mac|iPhone|iPad|iPod/i.test(navigator.platform)}
export function formatShortcut(shortcut:string|null,mac=isMacShortcutPlatform()){if(!shortcut)return'Not set';const labels:Record<string,string>={Mod:mac?'Cmd':'Ctrl',Alt:mac?'Option':'Alt',Shift:'Shift',Escape:'Esc',Delete:'Del',Space:'Space',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Comma:',',Period:'.',Slash:'/',Backslash:'\\',Semicolon:';',Quote:"'",BracketLeft:'[',BracketRight:']',Minus:'−',Equal:'=',Backquote:'`'};return shortcut.split('+').map(token=>labels[token]??token.replace(/^Key/,'').replace(/^Digit/,'')).join(' + ')}
