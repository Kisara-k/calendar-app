export function toISO(date: Date) {
  const y=date.getFullYear(), m=String(date.getMonth()+1).padStart(2,'0'), d=String(date.getDate()).padStart(2,'0')
  return `${y}-${m}-${d}`
}

export function fromISO(iso: string) {
  const [y,m,d]=iso.split('-').map(Number)
  return new Date(y,m-1,d)
}

export function addDays(date: Date, amount: number) {
  const next=new Date(date); next.setDate(next.getDate()+amount); return next
}

export function startOfWeek(date: Date) {
  const next=new Date(date); const day=(next.getDay()+6)%7; next.setDate(next.getDate()-day); next.setHours(0,0,0,0); return next
}

export function weekDates(anchor: Date, showWeekends=true) {
  const start=startOfWeek(anchor)
  return Array.from({length:showWeekends?7:5},(_,i)=>addDays(start,i))
}

export function monthLabel(dates: Date[]) {
  const first=dates[0], last=dates[dates.length-1]
  const fmt=new Intl.DateTimeFormat('en',{month:'long'})
  return first.getMonth()===last.getMonth()?`${fmt.format(first)} ${first.getFullYear()}`:`${fmt.format(first)} – ${fmt.format(last)} ${last.getFullYear()}`
}

export function rangeLabel(dates: Date[]) {
  const first=dates[0], last=dates[dates.length-1]
  return first.getMonth()===last.getMonth()?`${first.toLocaleString('en',{month:'long'})} ${first.getDate()}–${last.getDate()}`:`${first.toLocaleString('en',{month:'short'})} ${first.getDate()} – ${last.toLocaleString('en',{month:'short'})} ${last.getDate()}`
}

export function formatTime(value:number, format:'12h'|'24h'='12h') {
  const hours=Math.floor(value), minutes=Math.round((value-hours)*60)%60
  if(format==='24h') return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`
  const h=hours%12||12
  return `${h}:${String(minutes).padStart(2,'0')} ${hours>=12?'PM':'AM'}`
}

export function snapTime(value:number, minutes:number) {
  const step=minutes/60
  return Math.round(value/step)*step
}
