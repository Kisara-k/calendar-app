'use client'
type Props={value:number;onChange:(v:number)=>void;'aria-label'?:string}
export function HourScaleSlider({'aria-label':ariaLabel,value,onChange}:Props){return <input type="range" min="0.5" max="1.5" step="0.05" value={value} aria-label={ariaLabel??'Hour density'} onChange={e=>onChange(+e.target.value)}/>}
