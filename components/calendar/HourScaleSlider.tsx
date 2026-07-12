'use client'
type Props={value:number;onChange:(v:number)=>void;'aria-label'?:string}
export function HourScaleSlider({'aria-label':ariaLabel,value,onChange}:Props){const onWheel=(e:React.WheelEvent)=>{e.preventDefault();const next=Math.round((value+(-Math.sign(e.deltaY))*0.05)*100)/100;onChange(Math.min(1.5,Math.max(0.5,next)))};return <input type="range" min="0.5" max="1.5" step="0.05" value={value} aria-label={ariaLabel??'Hour density'} onChange={e=>onChange(+e.target.value)} onWheel={onWheel}/>}
