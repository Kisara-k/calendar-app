const days=[['M','Monday'],['T','Tuesday'],['W','Wednesday'],['T','Thursday'],['F','Friday'],['S','Saturday'],['S','Sunday']] as const

export function WeekdayPicker({selected,onToggle,label}:{selected:number[];onToggle:(day:number)=>void;label:string}){return <div className="weekday-picker" aria-label={label}>{days.map(([short,name],index)=><button type="button" key={name} title={name} aria-label={name} className={selected.includes(index)?'active':''} onClick={()=>onToggle(index)} aria-pressed={selected.includes(index)}>{short}</button>)}</div>}
