const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')

require.extensions['.ts']=(module,filename)=>{const source=fs.readFileSync(filename,'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;module._compile(output,filename)}

const {deriveLightEventColor,hexToRgb,rgbToOklch}=require('../lib/calendar/color-model.ts')
const samples=['#D50000','#FFF2A8','#0B8043','#4FC3F7','#3F51B5','#8E24AA','#B39DDB','#202020','#EEEEEE']
const hueDistance=(a,b)=>Math.min(Math.abs(a-b),360-Math.abs(a-b))

test('light event colors are deterministic valid sRGB hex values',()=>{for(const color of samples){const first=deriveLightEventColor(color),second=deriveLightEventColor(color);assert.match(first,/^#[0-9A-F]{6}$/);assert.equal(first,second)}})

test('light event colors remain inside the intended perceptual lightness band',()=>{for(const color of samples){const derived=hexToRgb(deriveLightEventColor(color));assert.ok(derived);const {l}=rgbToOklch(derived);assert.ok(l>=.53&&l<=.77,`${color} produced lightness ${l}`)}})

test('light event colors meaningfully boost chroma when the target remains in gamut',()=>{for(const color of ['#FFF2A8','#0B8043','#8E24AA','#B39DDB']){const source=rgbToOklch(hexToRgb(color)),derived=rgbToOklch(hexToRgb(deriveLightEventColor(color)));assert.ok(derived.c>source.c*1.12,`${color} did not become meaningfully more colorful`)}})

test('the transform smoothly reverses source lightness without directly inverting it',()=>{const dark=rgbToOklch(hexToRgb(deriveLightEventColor('#202020'))).l,light=rgbToOklch(hexToRgb(deriveLightEventColor('#E0E0E0'))).l;assert.ok(dark>light);assert.notEqual(deriveLightEventColor('#202020'),'#DFDFDF')})

test('chromatic event colors preserve their hue identity',()=>{for(const color of samples.slice(0,7)){const source=rgbToOklch(hexToRgb(color)),derived=rgbToOklch(hexToRgb(deriveLightEventColor(color)));assert.ok(hueDistance(source.h,derived.h)<2,`${color} shifted hue from ${source.h} to ${derived.h}`)}})

test('invalid color input is left unchanged',()=>{assert.equal(deriveLightEventColor('not-a-color'),'not-a-color')})
