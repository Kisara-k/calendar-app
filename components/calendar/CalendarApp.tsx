'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, Check, Search, Settings2, Target } from 'lucide-react'
import { useCalendarStore } from '@/hooks/useCalendarStore'
import { addDays, rangeLabel, startOfWeek, toISO, weekDates } from '@/lib/calendar/date'
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

const RIGHT_PANEL_STORAGE_KEY = 'tempo-right-panel-v1'
const isUtilityPanel = (value: unknown): value is UtilityPanel => value === null || value === 'insights' || value === 'settings' || value === 'search' || value === 'shortcuts'

export function CalendarApp(){
  const store=useCalendarStore();const {data}=store
  const [layer,setLayer]=useState<Layer>('plan');const [view,setView]=useState<ViewMode>('week');const [anchor,setAnchor]=useState(new Date(2026,6,11));const [utilityPanel,setUtilityPanel]=useState<UtilityPanel>('insights');const [eventOpen,setEventOpen]=useState(false);const [rightPanelReady,setRightPanelReady]=useState(false);const [sidebarOpen,setSidebarOpen]=useState(true);const [selectedIds,setSelectedIds]=useState<string[]>([]);const [commandOpen,setCommandOpen]=useState(false);const [toast,setToast]=useState('')
  const dates=useMemo(()=>view==='day'?[anchor]:weekDates(anchor,data.settings.showWeekends),[anchor,view,data.settings.showWeekends])
  const selected=data.blocks.find(b=>b.id===selectedIds[selectedIds.length-1])
  const activePanel:Panel=!rightPanelReady?null:eventOpen&&selected?'event':utilityPanel
  const select=useCallback((id:string,additive:boolean)=>setSelectedIds(v=>additive?(v.includes(id)?v.filter(x=>x!==id):[...v,id]):[id]),[])
  const open=useCallback((id:string)=>{setSelectedIds([id]);setEventOpen(true)},[])
  const showUtility=useCallback((next:Panel)=>{if(next==='event')return;setUtilityPanel(next);setEventOpen(false)},[])
  const navigate=useCallback((n:number)=>setAnchor(v=>addDays(v,n*(view==='day'?1:view==='week'?7:30))),[view])
  const newBlock=useCallback(()=>{const date=view==='month'?anchor:dates[0];const block=store.createBlock({date:toISO(date),start:9,end:10,title:'New event',categoryId:data.categories.find(c=>c.visible)?.id??data.categories[0].id,layer});open(block.id)},[anchor,dates,view,layer,data.categories,store,open])
  const setToastBrief=(message:string)=>{setToast(message);window.setTimeout(()=>setToast(''),2400)}
  const copyPlan=()=>{const count=store.copyPlanToActual(dates.map(toISO));setToastBrief(count?`${count} planned blocks copied`:'Actual already matches this plan')}
  const deleteSelected=useCallback(()=>{if(!selectedIds.length)return;store.deleteBlocks(selectedIds);setSelectedIds([]);setEventOpen(false)},[selectedIds,store])

  useEffect(()=>{if(window.innerWidth<850)setSidebarOpen(false);try{const saved=JSON.parse(localStorage.getItem(RIGHT_PANEL_STORAGE_KEY)??'"insights"');if(isUtilityPanel(saved))setUtilityPanel(saved)}catch{}setRightPanelReady(true)},[])
  useEffect(()=>{if(rightPanelReady)localStorage.setItem(RIGHT_PANEL_STORAGE_KEY,JSON.stringify(utilityPanel))},[rightPanelReady,utilityPanel])

  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{const target=e.target as HTMLElement;if(['INPUT','TEXTAREA','SELECT'].includes(target.tagName))return
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setCommandOpen(true);return}
      if(e.key==='?'){showUtility('shortcuts');return}if(e.key==='Escape'){setCommandOpen(false);setSelectedIds([]);if(eventOpen)setEventOpen(false);return}
      if(e.key==='Delete'||e.key==='Backspace'){deleteSelected();return}if(e.key==='ArrowLeft')navigate(-1);if(e.key==='ArrowRight')navigate(1)
      if(e.key.toLowerCase()==='n')newBlock();if(e.key.toLowerCase()==='t')setAnchor(new Date());if(e.key.toLowerCase()==='d')setView('day');if(e.key.toLowerCase()==='w')setView('week');if(e.key.toLowerCase()==='m')setView('month');if(e.key==='1')setLayer('plan');if(e.key==='2')setLayer('actual');if(e.key.toLowerCase()==='i')showUtility('insights');if(e.key==='/'){e.preventDefault();showUtility('search')}
    };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)
  },[deleteSelected,eventOpen,navigate,newBlock,showUtility])

  const actions=[
    {label:'Create new block',hint:'N',icon:<CalendarDays size={15}/>,run:newBlock},{label:'Go to today',hint:'T',icon:<CalendarDays size={15}/>,run:()=>setAnchor(new Date())},{label:'Switch to Plan',hint:'1',icon:<Target size={15}/>,run:()=>setLayer('plan')},{label:'Switch to Actual',hint:'2',icon:<Check size={15}/>,run:()=>setLayer('actual')},{label:'Show weekly insights',hint:'I',icon:<BarChart3 size={15}/>,run:()=>showUtility('insights')},{label:'Search blocks',hint:'/',icon:<Search size={15}/>,run:()=>showUtility('search')},{label:'Open settings',hint:'',icon:<Settings2 size={15}/>,run:()=>showUtility('settings')},
  ]
  const closeEvent=()=>{setEventOpen(false);setSelectedIds([])}
  const closeUtility=()=>setUtilityPanel(null)
  return <main className="tempo-app" style={{'--ghost-opacity':data.settings.underlayOpacity/100} as React.CSSProperties}>
    <AppHeader layer={layer} view={view} range={rangeLabel(dates)} sidebarOpen={sidebarOpen} panel={utilityPanel} onLayer={v=>{setLayer(v);setSelectedIds([]);setEventOpen(false)}} onView={setView} onToggleSidebar={()=>setSidebarOpen(v=>!v)} onNavigate={navigate} onToday={()=>setAnchor(new Date())} onPanel={showUtility} onCommand={()=>setCommandOpen(true)}/>
    <div className="app-body">{sidebarOpen&&<Sidebar anchor={anchor} categories={data.categories} panel={utilityPanel} onAnchor={setAnchor} onToggleCategory={store.toggleCategory} onNew={newBlock} onPanel={showUtility}/>}<section className="calendar-workspace">
      <CalendarToolbar layer={layer} subtitle={layer==='plan'?'Shape the week before it shapes you.':'Planned blocks stay visible as a quiet guide.'} onCopyPlan={copyPlan} onZoom={n=>store.patchSettings({density:n<0?'compact':'comfortable'})} onDisplay={()=>showUtility('settings')}/>
      {view==='month'?<MonthView anchor={anchor} blocks={data.blocks} categories={data.categories} layer={layer} onOpen={open} onDay={d=>{setAnchor(d);setView('day')}}/>:<WeekGrid dates={dates} blocks={data.blocks} categories={data.categories} settings={data.settings} layer={layer} selectedIds={selectedIds} onSelect={select} onClearSelection={()=>setSelectedIds([])} onCreate={store.createBlock} onUpdate={store.updateBlock} onUpdateMany={store.updateBlocks} onOpen={open}/>} </section>
      {activePanel==='event'&&selected&&<EventInspector block={selected} categories={data.categories} onSave={store.updateBlock} onDelete={deleteSelected} onDuplicate={()=>{const b=store.createBlock({...selected,title:`${selected.title} copy`});open(b.id)}} onCopyLayer={target=>{const b=store.createBlock({...selected,layer:target,sourcePlanId:target==='actual'&&selected.layer==='plan'?selected.id:undefined});setLayer(target);open(b.id)}} onClose={closeEvent}/>} 
      {activePanel==='insights'&&<InsightsPanel blocks={data.blocks} categories={data.categories} settings={data.settings} dates={dates} layer={layer} onClose={closeUtility}/>} {activePanel==='settings'&&<SettingsPanel settings={data.settings} data={data} onPatch={store.patchSettings} onImport={next=>{try{store.replaceData(next);setToastBrief('Calendar imported')}catch{setToastBrief('That calendar file is not valid')}}} onReset={()=>{store.reset();setToastBrief('Demo calendar restored')}} onClose={closeUtility}/>} {activePanel==='search'&&<SearchPanel blocks={data.blocks} categories={data.categories} onOpen={b=>{setAnchor(new Date(`${b.date}T12:00:00`));setLayer(b.layer);open(b.id)}} onClose={closeUtility}/>} {activePanel==='shortcuts'&&<ShortcutsPanel onClose={closeUtility}/>} {activePanel===null&&<aside className="context-panel empty-context-panel" aria-label="Right sidebar"/>}
    </div>
    {commandOpen&&<CommandPalette actions={actions} onClose={()=>setCommandOpen(false)}/>} {store.undo&&<div className="undo-toast"><span>{store.undo.label}</span><button onClick={store.undoDelete}>Undo</button><button aria-label="Dismiss" onClick={()=>store.setUndo(null)}>×</button></div>} {toast&&<div className="app-toast">{toast}</div>}
  </main>
}
