const CELL_VERTICAL_PADDING=8
const DATE_HEIGHT=22
const EVENT_HEIGHT=19
const MORE_HEIGHT=16

export function monthEventLayout(cellHeight:number,totalEvents:number){const available=Math.max(0,cellHeight-CELL_VERTICAL_PADDING-DATE_HEIGHT),fullCapacity=Math.max(0,Math.floor(available/EVENT_HEIGHT));if(totalEvents<=fullCapacity)return{visible:totalEvents,showMore:false};if(available<MORE_HEIGHT)return{visible:0,showMore:false};return{visible:Math.max(0,Math.floor((available-MORE_HEIGHT)/EVENT_HEIGHT)),showMore:true}}
export function monthEventPriority(allDay:boolean,categoryId:string,favorites:ReadonlySet<string>){return allDay?0:favorites.has(categoryId)?1:2}
