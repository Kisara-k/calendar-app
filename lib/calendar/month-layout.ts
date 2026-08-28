import type { CalendarBlock, Layer } from './types'

const CELL_VERTICAL_PADDING=8
const DATE_HEIGHT=22
const EVENT_HEIGHT=19
const MORE_HEIGHT=16

export function monthEventLayout(cellHeight:number,totalEvents:number){const available=Math.max(0,cellHeight-CELL_VERTICAL_PADDING-DATE_HEIGHT),fullCapacity=Math.max(0,Math.floor(available/EVENT_HEIGHT));if(totalEvents<=fullCapacity)return{visible:totalEvents,showMore:false};if(available<MORE_HEIGHT)return{visible:0,showMore:false};return{visible:Math.max(0,Math.floor((available-MORE_HEIGHT)/EVENT_HEIGHT)),showMore:true}}
export function monthEventPriority(allDay:boolean,categoryId:string,favorites:ReadonlySet<string>){return allDay?0:favorites.has(categoryId)?1:2}
export function monthFavoriteFallbackIds(blocks:readonly CalendarBlock[],layer:Layer,favorites:ReadonlySet<string>,now:number){const targets=blocks.filter(block=>block.layer===layer),targetIds=new Set(targets.map(block=>block.id)),sourcePlanIds=new Set(targets.flatMap(block=>block.sourcePlanId?[block.sourcePlanId]:[])),naturalMatches=new Set(targets.map(block=>`${block.date}|${block.title.toLocaleLowerCase()}`)),opposite=layer==='actual'?'plan':'actual';return new Set(blocks.filter(block=>{const linkedMatch=block.layer==='plan'?sourcePlanIds.has(block.id):!!block.sourcePlanId&&targetIds.has(block.sourcePlanId);if(block.layer!==opposite||block.allDay||!favorites.has(block.categoryId)||linkedMatch||naturalMatches.has(`${block.date}|${block.title.toLocaleLowerCase()}`))return false;const [year,month,day]=block.date.split('-').map(Number),end=new Date(year,month-1,day);end.setMinutes(Math.round(block.end*60));return end.getTime()>now}).map(block=>block.id))}
