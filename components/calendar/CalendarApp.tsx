'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, Check, Search, Settings2, Target } from 'lucide-react'
import { useCalendarStore } from '@/hooks/useCalendarStore'
import { addDays, rangeLabel, toISO, weekDates } from '@/lib/calendar/date'
import type { CalendarBlock, Layer, Panel, UtilityPanel, ViewMode } from '@/lib/calendar/types'
import { AppHeader } from './AppHeader'
import { Sidebar } from './Sidebar'
import { CalendarToolbar } from './CalendarToolbar'
import { WeekGrid } from './WeekGrid'
import { MonthView } from './MonthView'
import { EventInspector } from './EventInspector'
import { InsightsPanel } from './InsightsPanel'
import { SettingsPanel } from './SettingsPanel'
import { SearchPanel } from './SearchPanel'
import { ShortcutsPanel } from './ShortcutsPanel'
import { CommandPalette } from './CommandPalette'
import { EventMenu } from './FloatingMenus'

const RIGHT_PANEL_STORAGE_KEY='tempo-right-panel-v1'
const isUtilityPanel=(value:unknown):value is UtilityPanel=>value===null||value==='insights'||value==='settings'||value==='search'||value==='shortcuts'

export function CalendarApp(){
  const store=useCalendarStore(),{data}=store
  const [layer,setLayer]=useState<Layer>('plan'),[view,setView]=useState<ViewMode>('week'),[anchor,setAnchor]=useState(new Date(2026,6,11))
  const [utilityPanel,setUtilityPanel]=useState<UtilityPanel>('insights'),[eventOpen,setEventOpen]=useState(false),[rightPanelReady,setRightPanelReady]=useState(false),[sidebarOpen,setSidebarOpen]=useState(true)
  const [selectedIds,setSelectedIds]=useState<string[]>([]),[draftBlock,setDraftBlock]=useState<CalendarBlock|null>(null),[eventMenu,setEventMenu]=useState<{id:string;x:number;y:number}|null>(null)
  const [commandOpen,setCommandOpen]=useState(false),[toast,setToast]=useState('')
  const dates=useMemo(()=>view==='day'?[anchor]:weekDates(anchor,data.settings.showWeekends),[anchor,view,data.settings.showWeekends])
  const renderedBlocks=useMemo(()=>draftBlock?[...data.blocks,draftBlock]:data.blocks,[data.blocks,draftBlock])
  const selected=renderedBlocks.find(b=>b.id===selectedIds[selectedIds.length-1])
  const activePanel:Panel=!rightPanelReady?null:eventOpen&&selected?'event':utilityPanel

  const select=useCallback((id:string,additive:boolean)=>setSelectedIds(v=>additive?(v.includes(id)?v.filter(x=>x!==id):[...v,id]):[id]),[])
  const open=useCallback((id:string)=>{setDraftBlock(current=>current&&current.id!==id?null:current);setSelectedIds([id]);setEventOpen(true);setEventMenu(null)},[])
  const showUtility=useCallback((next:Panel)=>{if(next==='event')return;setUtilityPanel(next);setEventOpen(false);setDraftBlock(null)},[])
  const navigate=useCallback((n:number,oneDay=false)=>setAnchor(v=>addDays(v,n*(oneDay?1:view==='day'?1:view==='week'?7:30))),[view])
  const createDraft=useCallback((input:Omit<CalendarBlock,'id'>)=>{const block={...input,id:crypto.randomUUID()};setDraftBlock(block);return block},[])
  const newBlock=useCallback(()=>{const date=view==='month'?anchor:dates[0],block=createDraft({date:toISO(date),start:9,end:10,title:'',categoryId:data.settings.defaultCategoryId,layer});setSelectedIds([block.id]);setEventOpen(true)},[anchor,dates,view,layer,data.settings.defaultCategoryId,createDraft])
  const notify=(message:string)=>{setToast(message);window.setTimeout(()=>setToast(''),2400)}
  const copyPlan=()=>{const count=store.copyPlanToActual(dates.map(toISO));notify(count?`${count} planned blocks copied`:'Actual already matches this plan')}
  const deleteSelected=useCallback(()=>{if(!selectedIds.length)return;if(draftBlock&&selectedIds.includes(draftBlock.id))setDraftBlock(null);const persisted=selectedIds.filter(id=>id!==draftBlock?.id);if(persisted.length)store.deleteBlocks(persisted);setSelectedIds([]);setEventOpen(false)},[selectedIds,draftBlock,store])
  const changeBlock=useCallback((next:CalendarBlock)=>{if(draftBlock?.id===next.id){if(next.title.length>0||next.categoryId!==data.settings.defaultCategoryId){store.addBlock(next);setDraftBlock(null)}else setDraftBlock(next)}else store.updateBlock(next)},[draftBlock,data.settings.defaultCategoryId,store])
  const closeEvent=()=>{setEventOpen(false);setSelectedIds([]);setDraftBlock(null)}
  const closeUtility=()=>setUtilityPanel(null)

  useEffect(()=>{if(window.innerWidth<850)setSidebarOpen(false);try{const saved=JSON.parse(localStorage.getItem(RIGHT_PANEL_STORAGE_KEY)??'"insights"');if(isUtilityPanel(saved))setUtilityPanel(saved)}catch{}setRightPanelReady(true)},[])
  useEffect(()=>{if(rightPanelReady)localStorage.setItem(RIGHT_PANEL_STORAGE_KEY,JSON.stringify(utilityPanel))},[rightPanelReady,utilityPanel])
  useEffect(()=>{if(!store.undo)return;const timer=window.setTimeout(()=>store.setUndo(null),6000);return()=>window.clearTimeout(timer)},[store.undo,store.setUndo])
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{const target=e.target as HTMLElement;if(['INPUT','TEXTAREA','SELECT'].includes(target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setCommandOpen(true);return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?store.redoHistory():store.undoHistory();return}if(e.key==='?'){showUtility('shortcuts');return}if(e.key==='Escape'){setCommandOpen(false);setSelectedIds([]);if(eventOpen){setEventOpen(false);setDraftBlock(null)}return}if(e.key==='Delete'||e.key==='Backspace'){deleteSelected();return}if(e.key==='ArrowLeft')navigate(-1,e.shiftKey);if(e.key==='ArrowRight')navigate(1,e.shiftKey);if(e.key.toLowerCase()==='n')newBlock();if(e.key.toLowerCase()==='t')setAnchor(new Date());if(e.key.toLowerCase()==='d')setView('day');if(e.key.toLowerCase()==='w')setView('week');if(e.key.toLowerCase()==='m')setView('month');if(e.key==='1')setLayer('plan');if(e.key==='2')setLayer('actual');if(e.key.toLowerCase()==='i')showUtility('insights');if(e.key==='/'){e.preventDefault();showUtility('search')}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[deleteSelected,eventOpen,navigate,newBlock,showUtility,store])

  const duplicate=(source:CalendarBlock)=>{if(source.id===draftBlock?.id)return;store.createBlock({...source,title:`${source.title} copy`})}
  const copyLayer=(source:CalendarBlock,target:Layer)=>{if(source.id===draftBlock?.id)return;store.createBlock({...source,layer:target,sourcePlanId:target==='actual'&&source.layer==='plan'?source.id:undefined})}
  const actions=[{label:'Create new block',hint:'N',icon:<CalendarDays size={15}/>,run:newBlock},{label:'Go to today',hint:'T',icon:<CalendarDays size={15}/>,run:()=>setAnchor(new Date())},{label:'Switch to Plan',hint:'1',icon:<Target size={15}/>,run:()=>setLayer('plan')},{label:'Switch to Actual',hint:'2',icon:<Check size={15}/>,run:()=>setLayer('actual')},{label:'Show weekly insights',hint:'I',icon:<BarChart3 size={15}/>,run:()=>showUtility('insights')},{label:'Search blocks',hint:'/',icon:<Search size={15}/>,run:()=>showUtility('search')},{label:'Open settings',hint:'',icon:<Settings2 size={15}/>,run:()=>showUtility('settings')}]
  const menuBlock=eventMenu?renderedBlocks.find(b=>b.id===eventMenu.id):undefined

  return <main className="tempo-app" style={{'--ghost-opacity':data.settings.underlayOpacity/100} as React.CSSProperties}>
    <AppHeader layer={layer} view={view} range={rangeLabel(dates)} sidebarOpen={sidebarOpen} panel={utilityPanel} onLayer={v=>{setLayer(v);setSelectedIds([]);setEventOpen(false);setDraftBlock(null)}} onView={setView} onToggleSidebar={()=>setSidebarOpen(v=>!v)} onNavigate={navigate} onToday={()=>setAnchor(new Date())} onPanel={showUtility} onCommand={()=>setCommandOpen(true)}/>
    <div className="app-body">{sidebarOpen&&<Sidebar anchor={anchor} categories={data.categories} groups={data.groups} defaultCategoryId={data.settings.defaultCategoryId} panel={utilityPanel} onAnchor={setAnchor} onToggleCategory={store.toggleCategory} onToggleGroup={store.toggleGroup} onReorder={store.reorderCategories} onRename={store.renameCategory} onAdd={store.createCategory} onColor={store.colorCategory} onDefault={store.setDefaultCategory} onDelete={store.deleteCategory} onMerge={store.mergeCategory} onNew={newBlock} onPanel={showUtility}/>}<section className="calendar-workspace"><CalendarToolbar layer={layer} quote={data.currentQuote} settings={data.settings} onQuote={store.setQuote} onNextQuote={store.nextQuote} onCopyPlan={copyPlan} onPatch={store.patchSettings}/>{view==='month'?<MonthView anchor={anchor} blocks={renderedBlocks} categories={data.categories} layer={layer} onOpen={open} onDay={d=>{setAnchor(d);setView('day')}}/>:<WeekGrid dates={dates} blocks={renderedBlocks} categories={data.categories} settings={data.settings} layer={layer} selectedIds={selectedIds} onSelect={select} onClearSelection={()=>setSelectedIds([])} onCreate={createDraft} onUpdate={store.updateBlock} onUpdateMany={store.updateBlocks} onOpen={open} onEventContext={(id,x,y)=>{setSelectedIds([id]);setEventMenu({id,x,y})}}/>}</section>
      {activePanel==='event'&&selected&&<EventInspector block={selected} isDraft={draftBlock?.id===selected.id} categories={data.categories} onChange={changeBlock} onDelete={deleteSelected} onDuplicate={()=>duplicate(selected)} onCopyLayer={target=>copyLayer(selected,target)} onClose={closeEvent}/>} {activePanel==='insights'&&<InsightsPanel blocks={data.blocks} categories={data.categories} settings={data.settings} dates={dates} layer={layer} onClose={closeUtility}/>} {activePanel==='settings'&&<SettingsPanel settings={data.settings} data={data} onPatch={store.patchSettings} onImport={next=>{try{store.replaceData(next);notify('Calendar imported')}catch{notify('That calendar file is not valid')}}} onReset={()=>{store.reset();notify('Demo calendar restored')}} onShortcuts={()=>showUtility('shortcuts')} onClose={closeUtility}/>} {activePanel==='search'&&<SearchPanel blocks={data.blocks} categories={data.categories} onOpen={b=>{setAnchor(new Date(`${b.date}T12:00:00`));setLayer(b.layer);open(b.id)}} onClose={closeUtility}/>} {activePanel==='shortcuts'&&<ShortcutsPanel onClose={()=>showUtility('settings')}/>} {activePanel===null&&<aside className="context-panel empty-context-panel" aria-label="Right sidebar"/>}
    </div>
    {eventMenu&&menuBlock&&<EventMenu x={eventMenu.x} y={eventMenu.y} block={menuBlock} calendars={data.categories} onDuplicate={()=>{duplicate(menuBlock);setEventMenu(null)}} onCopyLayer={target=>{copyLayer(menuBlock,target);setEventMenu(null)}} onCalendar={id=>{changeBlock({...menuBlock,categoryId:id});setEventMenu(null)}} onDelete={()=>{menuBlock.id===draftBlock?.id?setDraftBlock(null):store.deleteBlocks([menuBlock.id]);setEventMenu(null)}} onClose={()=>setEventMenu(null)}/>} {commandOpen&&<CommandPalette actions={actions} onClose={()=>setCommandOpen(false)}/>} {store.undo&&<div className="undo-toast"><span>{store.undo.label}</span><button onClick={store.undoDelete}>Undo</button><button aria-label="Dismiss" onClick={()=>store.setUndo(null)}>×</button></div>} {toast&&<div className="app-toast">{toast}</div>}
  </main>
}
