export type Rgb={r:number;g:number;b:number}
export type Hsl={h:number;s:number;l:number}
export type Hsv={h:number;s:number;v:number}
export type Oklch={l:number;c:number;h:number}
export type HslChannel=keyof Hsl

const LIGHT_CALENDAR_SOURCE_LIGHTNESS_MIN=.18
const LIGHT_CALENDAR_SOURCE_LIGHTNESS_MAX=.92
const LIGHT_CALENDAR_EVENT_OUTPUT_LIGHTNESS_MIN=.74
const LIGHT_CALENDAR_EVENT_OUTPUT_LIGHTNESS_MAX=.86
const LIGHT_CALENDAR_EVENT_CHROMA_BOOST_MIN=1.7
const LIGHT_CALENDAR_EVENT_CHROMA_BOOST_MAX=2
const LIGHT_CALENDAR_EVENT_CHROMA_MAX=.34
const LIGHT_CALENDAR_NON_EVENT_OUTPUT_LIGHTNESS_MIN=.84
const LIGHT_CALENDAR_NON_EVENT_OUTPUT_LIGHTNESS_MAX=.95
const LIGHT_CALENDAR_NON_EVENT_CHROMA_BOOST_MIN=1.25
const LIGHT_CALENDAR_NON_EVENT_CHROMA_BOOST_MAX=1.5
const LIGHT_CALENDAR_NON_EVENT_CHROMA_MAX=.28
const OKLCH_GAMUT_SEARCH_STEPS=14
export type CalendarColorRole='event'|'nonEvent'
const LIGHT_CALENDAR_ROLE_PARAMETERS:Record<CalendarColorRole,{lightnessMin:number;lightnessMax:number;chromaBoostMin:number;chromaBoostMax:number;chromaMax:number}>={event:{lightnessMin:LIGHT_CALENDAR_EVENT_OUTPUT_LIGHTNESS_MIN,lightnessMax:LIGHT_CALENDAR_EVENT_OUTPUT_LIGHTNESS_MAX,chromaBoostMin:LIGHT_CALENDAR_EVENT_CHROMA_BOOST_MIN,chromaBoostMax:LIGHT_CALENDAR_EVENT_CHROMA_BOOST_MAX,chromaMax:LIGHT_CALENDAR_EVENT_CHROMA_MAX},nonEvent:{lightnessMin:LIGHT_CALENDAR_NON_EVENT_OUTPUT_LIGHTNESS_MIN,lightnessMax:LIGHT_CALENDAR_NON_EVENT_OUTPUT_LIGHTNESS_MAX,chromaBoostMin:LIGHT_CALENDAR_NON_EVENT_CHROMA_BOOST_MIN,chromaBoostMax:LIGHT_CALENDAR_NON_EVENT_CHROMA_BOOST_MAX,chromaMax:LIGHT_CALENDAR_NON_EVENT_CHROMA_MAX}}

export const clamp=(n:number,min=0,max=255)=>Math.max(min,Math.min(max,n))
export const hexToRgb=(hex:string):Rgb|null=>{const v=hex.replace('#','');return /^[0-9a-f]{6}$/i.test(v)?{r:parseInt(v.slice(0,2),16),g:parseInt(v.slice(2,4),16),b:parseInt(v.slice(4,6),16)}:null}
export const rgbToHex=({r,g,b}:Rgb)=>`#${[r,g,b].map(v=>Math.round(clamp(v)).toString(16).padStart(2,'0')).join('')}`.toUpperCase()
export function rgbToHsl({r,g,b}:Rgb):Hsl{r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}return {h:(h+360)%360,s:s*100,l:l*100}}
export function hslToRgb({h,s,l}:Hsl):Rgb{h=((h%360)+360)%360;s=clamp(s,0,100)/100;l=clamp(l,0,100)/100;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let rgb=[0,0,0];if(h<60)rgb=[c,x,0];else if(h<120)rgb=[x,c,0];else if(h<180)rgb=[0,c,x];else if(h<240)rgb=[0,x,c];else if(h<300)rgb=[x,0,c];else rgb=[c,0,x];return {r:Math.round((rgb[0]+m)*255),g:Math.round((rgb[1]+m)*255),b:Math.round((rgb[2]+m)*255)}}
export function rgbToHsv({r,g,b}:Rgb):Hsv{r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d){if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}return {h:(h+360)%360,s:max?d/max:0,v:max}}
export function hsvToRgb({h,s,v}:Hsv):Rgb{h=((h%360)+360)%360;const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let rgb=[0,0,0];if(h<60)rgb=[c,x,0];else if(h<120)rgb=[x,c,0];else if(h<180)rgb=[0,c,x];else if(h<240)rgb=[0,x,c];else if(h<300)rgb=[x,0,c];else rgb=[c,0,x];return {r:Math.round((rgb[0]+m)*255),g:Math.round((rgb[1]+m)*255),b:Math.round((rgb[2]+m)*255)}}
export function setHslChannel(model:Hsl,key:HslChannel,value:number):Hsl{return {...model,[key]:key==='h'?((value%360)+360)%360:clamp(value,0,100)}}
export function setPickerSaturationValue(model:Hsl,s:number,v:number):{model:Hsl;rgb:Rgb;hsv:Hsv}{const hsv={h:model.h,s:clamp(s,0,1),v:clamp(v,0,1)},rgb=hsvToRgb(hsv),derived=rgbToHsl(rgb);return {hsv,rgb,model:{h:model.h,s:derived.s,l:derived.l}}}
export function parseColor(value:string):{rgb:Rgb;hsl:Hsl}|null{const text=value.trim(),hex=hexToRgb(text);if(hex)return {rgb:hex,hsl:rgbToHsl(hex)};const parts=text.replace(/^hsla?\s*\(/i,'').replace(/\)\s*$/,'').replace(/%/g,' ').split(/[\s,]+/).filter(Boolean).map(Number);if(parts.length<3||parts.slice(0,3).some(Number.isNaN))return null;const hsl={h:((parts[0]%360)+360)%360,s:clamp(parts[1],0,100),l:clamp(parts[2],0,100)},rgb=hslToRgb(hsl);return {rgb,hsl}}

const srgbToLinear=(value:number)=>{const channel=value/255;return channel<=.04045?channel/12.92:Math.pow((channel+.055)/1.055,2.4)}
const linearToSrgb=(value:number)=>255*(value<=.0031308?12.92*value:1.055*Math.pow(value,1/2.4)-.055)
export function rgbToOklch({r,g,b}:Rgb):Oklch{r=srgbToLinear(r);g=srgbToLinear(g);b=srgbToLinear(b);const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b),lightness=.2104542553*l+.793617785*m-.0040720468*s,a=1.9779984951*l-2.428592205*m+.4505937099*s,axisB=.0259040371*l+.7827717662*m-.808675766*s;return{l:lightness,c:Math.hypot(a,axisB),h:(Math.atan2(axisB,a)*180/Math.PI+360)%360}}
function oklchToRgbUnclamped({l,c,h}:Oklch):Rgb{const radians=h*Math.PI/180,a=c*Math.cos(radians),axisB=c*Math.sin(radians),ll=l+.3963377774*a+.2158037573*axisB,mm=l-.1055613458*a-.0638541728*axisB,ss=l-.0894841775*a-1.291485548*axisB,l3=ll*ll*ll,m3=mm*mm*mm,s3=ss*ss*ss;return{r:linearToSrgb(4.0767416621*l3-3.3077115913*m3+.2309699292*s3),g:linearToSrgb(-1.2684380046*l3+2.6097574011*m3-.3413193965*s3),b:linearToSrgb(-.0041960863*l3-.7034186147*m3+1.707614701*s3)}}
const inSrgb=({r,g,b}:Rgb)=>r>=0&&r<=255&&g>=0&&g<=255&&b>=0&&b<=255
export function oklchToRgb(model:Oklch):Rgb{let candidate=oklchToRgbUnclamped(model);if(inSrgb(candidate))return candidate;let low=0,high=model.c;for(let index=0;index<OKLCH_GAMUT_SEARCH_STEPS;index++){const chroma=(low+high)/2,next=oklchToRgbUnclamped({...model,c:chroma});if(inSrgb(next)){low=chroma;candidate=next}else high=chroma}return candidate}
const smoothstep=(from:number,to:number,value:number)=>{const t=clamp((value-from)/(to-from),0,1);return t*t*(3-2*t)}
const lightCalendarColorCache=new Map<string,string>()
export function deriveLightCalendarColor(color:string,role:CalendarColorRole):string{const sourceKey=color.toUpperCase(),key=`${role}:${sourceKey}`,cached=lightCalendarColorCache.get(key);if(cached)return cached;const rgb=hexToRgb(sourceKey);if(!rgb)return color;const source=rgbToOklch(rgb),position=smoothstep(LIGHT_CALENDAR_SOURCE_LIGHTNESS_MIN,LIGHT_CALENDAR_SOURCE_LIGHTNESS_MAX,source.l),parameters=LIGHT_CALENDAR_ROLE_PARAMETERS[role],lightness=parameters.lightnessMax+(parameters.lightnessMin-parameters.lightnessMax)*position,chromaBoost=parameters.chromaBoostMax+(parameters.chromaBoostMin-parameters.chromaBoostMax)*position,chroma=Math.min(source.c*chromaBoost,parameters.chromaMax),derived=rgbToHex(oklchToRgb({l:lightness,c:chroma,h:source.h}));lightCalendarColorCache.set(key,derived);return derived}
