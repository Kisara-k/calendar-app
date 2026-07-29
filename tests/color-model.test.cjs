const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')

require.extensions['.ts']=(module,filename)=>{const source=fs.readFileSync(filename,'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;module._compile(output,filename)}

const {deriveLightCalendarColor,hexToRgb,rgbToOklch}=require('../lib/calendar/color-model.ts')
const samples=['#D50000','#FFF2A8','#0B8043','#4FC3F7','#3F51B5','#8E24AA','#B39DDB','#202020','#EEEEEE']
const hueDistance=(a,b)=>Math.min(Math.abs(a-b),360-Math.abs(a-b))

test('light calendar colors are deterministic valid sRGB hex values',()=>{for(const role of ['event','nonEvent'])for(const color of samples){const first=deriveLightCalendarColor(color,role),second=deriveLightCalendarColor(color,role);assert.match(first,/^#[0-9A-F]{6}$/);assert.equal(first,second)}})

test('event and non-event roles derive independently',()=>{for(const color of samples)assert.notEqual(deriveLightCalendarColor(color,'event'),deriveLightCalendarColor(color,'nonEvent'),`${color} produced the same color for both roles`)})

test('the transform smoothly reverses source lightness without directly inverting it',()=>{for(const role of ['event','nonEvent']){const dark=rgbToOklch(hexToRgb(deriveLightCalendarColor('#202020',role))).l,light=rgbToOklch(hexToRgb(deriveLightCalendarColor('#E0E0E0',role))).l;assert.ok(dark>light);assert.notEqual(deriveLightCalendarColor('#202020',role),'#DFDFDF')}})

test('chromatic calendar colors preserve their hue identity',()=>{for(const role of ['event','nonEvent'])for(const color of samples.slice(0,7)){const source=rgbToOklch(hexToRgb(color)),derived=rgbToOklch(hexToRgb(deriveLightCalendarColor(color,role)));assert.ok(hueDistance(source.h,derived.h)<2,`${role} ${color} shifted hue from ${source.h} to ${derived.h}`)}})

test('invalid color input is left unchanged',()=>{assert.equal(deriveLightCalendarColor('not-a-color','event'),'not-a-color');assert.equal(deriveLightCalendarColor('not-a-color','nonEvent'),'not-a-color')})
