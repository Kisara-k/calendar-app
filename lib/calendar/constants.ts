import type { CalendarData } from './types'

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const LONG_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const CATEGORY_COLORS = ['#9b87f5', '#53b8d8', '#59c799', '#ef9866', '#dec05a', '#ec7e9c', '#7da3e8']

const rawPlan = [
  ['2026-07-06',7.5,8.5,'Morning run','health'],['2026-07-06',9,11.5,'Product strategy','deep'],['2026-07-06',13,14,'Lunch with Alex','personal'],['2026-07-06',15,16.5,'Design review','meetings'],
  ['2026-07-07',8,9,'Weekly planning','deep'],['2026-07-07',10,11,'Team stand-up','meetings'],['2026-07-07',11.5,14,'Focus: prototype','deep'],['2026-07-07',17.5,19,'Read & notes','learning'],
  ['2026-07-08',7,8,'Gym','health'],['2026-07-08',9,12,'Build dashboard','deep'],['2026-07-08',14,15,'Client sync','meetings'],
  ['2026-07-09',8.5,10.5,'Research sprint','deep'],['2026-07-09',11,12,'Project check-in','meetings'],['2026-07-09',16,17.5,'Course module','learning'],
  ['2026-07-10',7.5,8.5,'Morning run','health'],['2026-07-10',9,12,'Finish proposal','deep'],['2026-07-10',14,15,'Weekly review','personal'],
  ['2026-07-11',9,10.5,'Long walk','health'],['2026-07-11',12,14,'Family lunch','personal'],['2026-07-12',9.5,11,'Weekly reset','personal'],['2026-07-12',16,18,'Learn TypeScript','learning'],
] as const

const rawActual = [
  ['2026-07-06',7.5,8.25,'Morning run','health','completed'],['2026-07-06',9.25,11.25,'Product strategy','deep','partial'],['2026-07-06',15.25,16.75,'Design review','meetings','completed'],
  ['2026-07-07',8,9.25,'Weekly planning','deep','completed'],['2026-07-07',10.25,11,'Team stand-up','meetings','completed'],['2026-07-07',12,14,'Focus: prototype','deep','partial'],
  ['2026-07-08',7.25,8,'Gym','health','completed'],['2026-07-08',9,11.5,'Build dashboard','deep','partial'],['2026-07-08',14.25,15.25,'Client sync','meetings','completed'],
  ['2026-07-09',9,10.5,'Research sprint','deep','partial'],['2026-07-09',11,12,'Project check-in','meetings','completed'],['2026-07-10',7.5,8.25,'Morning run','health','completed'],
] as const

export const INITIAL_DATA: CalendarData = {
  version: 2,
  categories: [
    { id:'deep', name:'Deep work', color:'#9b87f5', visible:true },
    { id:'meetings', name:'Meetings', color:'#53b8d8', visible:true },
    { id:'health', name:'Health', color:'#59c799', visible:true },
    { id:'personal', name:'Personal', color:'#ef9866', visible:true },
    { id:'learning', name:'Learning', color:'#dec05a', visible:true },
  ],
  settings: { wakeHour:6, sleepHour:23, snapMinutes:15, defaultDuration:1, density:'default', showWeekends:true, timeFormat:'12h', underlayOpacity:14 },
  blocks: [
    ...rawPlan.map((x,i)=>({ id:`plan-${i+1}`,date:x[0],start:x[1],end:x[2],title:x[3],categoryId:x[4],layer:'plan' as const })),
    ...rawActual.map((x,i)=>({ id:`actual-${i+1}`,date:x[0],start:x[1],end:x[2],title:x[3],categoryId:x[4],layer:'actual' as const,status:x[5] as 'completed'|'partial' })),
  ]
}
