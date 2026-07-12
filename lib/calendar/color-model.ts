export type Rgb={r:number;g:number;b:number}
export type Hsl={h:number;s:number;l:number}
export type Hsv={h:number;s:number;v:number}
export type HslChannel=keyof Hsl

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
