'use client'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { clamp, hexToRgb, hslToRgb, parseColor, rgbToHex, rgbToHsl, setHslChannel, type Hsl, type HslChannel, type Rgb } from '@/lib/calendar/color-model'

type Mode='rgb'|'hsl'
const displayHsl=(hsl:Hsl)=>`${Math.round(hsl.h)}, ${Math.round(hsl.s)}, ${Math.round(hsl.l)}`

export function ColorEditor({color,onChange}:{color:string;onChange:(color:string)=>void}){
  const initialRgb=hexToRgb(color)??{r:128,g:128,b:128}
  const [open,setOpen]=useState(false),[mode,setMode]=useState<Mode>('rgb'),[model,setModel]=useState<Hsl>(()=>rgbToHsl(initialRgb)),[hexText,setHexText]=useState(color.toUpperCase()),[hslText,setHslText]=useState(()=>displayHsl(rgbToHsl(initialRgb)))
  const lastEmitted=useRef<string|null>(null)
  const rgb=hexToRgb(color)??initialRgb

  useEffect(()=>{const saved=localStorage.getItem('tempo-color-mode');if(saved==='rgb'||saved==='hsl')setMode(saved)},[])
  useEffect(()=>{setHexText(color.toUpperCase());if(color.toUpperCase()!==lastEmitted.current){const external=hexToRgb(color);if(external){const next=rgbToHsl(external);setModel(next);setHslText(displayHsl(next))}}lastEmitted.current=null},[color])
  useEffect(()=>setHslText(displayHsl(model)),[model])

  const chooseMode=(next:Mode)=>{setMode(next);localStorage.setItem('tempo-color-mode',next)}
  const emit=(nextRgb:Rgb,nextModel:Hsl)=>{const hex=rgbToHex(nextRgb);lastEmitted.current=hex;setModel(nextModel);setHexText(hex);onChange(hex)}
  const commit=(value:string,restore:()=>void)=>{const parsed=parseColor(value);parsed?emit(parsed.rgb,parsed.hsl):restore()}
  const setRgb=(key:keyof Rgb,value:number)=>{const next={...rgb,[key]:clamp(value)},nextModel=rgbToHsl(next);emit(next,nextModel)}
  const setHsl=(key:HslChannel,value:number)=>{const next=setHslChannel(model,key,value);emit(hslToRgb(next),next)}
  const channels=mode==='rgb'?[{key:'r' as const,value:rgb.r,max:255},{key:'g' as const,value:rgb.g,max:255},{key:'b' as const,value:rgb.b,max:255}]:[{key:'h' as const,value:model.h,max:360},{key:'s' as const,value:model.s,max:100},{key:'l' as const,value:model.l,max:100}]
  const formatText=mode==='rgb'?hexText:hslText

  return <div className={`custom-color-control ${open?'open':''}`}><button className="custom-color-trigger" type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span className="color-preview" style={{background:color}}/><span>Custom color</span><code>{color.toUpperCase()}</code><ChevronDown size={11}/></button>{open&&<div className="color-picker-panel"><HexColorPicker color={color} onChange={onChange}/><div className="color-mode-row"><div className="color-mode-toggle" aria-label="Color model"><button className={mode==='rgb'?'active':''} onClick={()=>chooseMode('rgb')}>RGB</button><button className={mode==='hsl'?'active':''} onClick={()=>chooseMode('hsl')}>HSL</button></div><label><span>{mode==='rgb'?'HEX':'HSL'}</span><input aria-label={mode==='rgb'?'HEX color':'HSL color'} value={formatText} onChange={e=>mode==='rgb'?setHexText(e.target.value):setHslText(e.target.value)} onBlur={()=>mode==='rgb'?commit(hexText,()=>setHexText(color.toUpperCase())):commit(hslText,()=>setHslText(displayHsl(model)))} onKeyDown={e=>e.key==='Enter'&&e.currentTarget.blur()}/></label></div><div className="rgb-sliders">{channels.map(channel=><label key={channel.key}><b>{channel.key.toUpperCase()}</b><input className="channel-slider" aria-label={`${channel.key.toUpperCase()} channel slider`} type="range" min="0" max={channel.max} value={channel.value} onChange={e=>mode==='rgb'?setRgb(channel.key as keyof Rgb,+e.target.value):setHsl(channel.key as HslChannel,+e.target.value)}/><input className="channel-value" aria-label={`${channel.key.toUpperCase()} channel value`} type="number" min="0" max={channel.max} value={Math.round(channel.value)} onChange={e=>mode==='rgb'?setRgb(channel.key as keyof Rgb,+e.target.value):setHsl(channel.key as HslChannel,+e.target.value)}/></label>)}</div></div>}</div>
}
