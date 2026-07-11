import { BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight, Command, Menu, Search, Settings2, Target } from 'lucide-react'
import type { Layer, Panel, ViewMode } from '@/lib/calendar/types'

type Props={layer:Layer;view:ViewMode;range:string;sidebarOpen:boolean;panel:Panel;onLayer:(v:Layer)=>void;onView:(v:ViewMode)=>void;onToggleSidebar:()=>void;onNavigate:(n:number)=>void;onToday:()=>void;onPanel:(p:Panel)=>void;onCommand:()=>void}

export function AppHeader(p:Props){
  return <header className="app-header">
    <div className="header-left"><button className="quiet-icon" aria-label="Toggle sidebar" onClick={p.onToggleSidebar}><Menu size={17}/></button><div className="notion-mark"><CalendarDays size={16}/></div><b className="product-name">Tempo</b><span className="header-range">{p.range}</span></div>
    <div className="layer-switch" aria-label="Calendar layer"><button className={p.layer==='plan'?'active':''} onClick={()=>p.onLayer('plan')}><Target size={14}/>Plan</button><button className={p.layer==='actual'?'active actual':''} onClick={()=>p.onLayer('actual')}><Check size={14}/>Actual</button></div>
    <div className="header-tools">
      <button className="today-control" onClick={p.onToday}>Today <kbd>T</kbd></button>
      <span className="nav-pair"><button aria-label="Previous range" onClick={()=>p.onNavigate(-1)}><ChevronLeft size={16}/></button><button aria-label="Next range" onClick={()=>p.onNavigate(1)}><ChevronRight size={16}/></button></span>
      <select className="view-select" value={p.view} onChange={e=>p.onView(e.target.value as ViewMode)} aria-label="Calendar view"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select>
      <span className="header-divider"/>
      <button className={`quiet-icon ${p.panel==='search'?'active':''}`} aria-label="Search" onClick={()=>p.onPanel(p.panel==='search'?null:'search')}><Search size={16}/></button>
      <button className="command-trigger" aria-label="Open command menu" onClick={p.onCommand}><Command size={15}/><span>Command</span><kbd>⌘K</kbd></button>
      <button className={`quiet-icon ${p.panel==='insights'?'active':''}`} aria-label="Toggle insights" onClick={()=>p.onPanel(p.panel==='insights'?null:'insights')}><BarChart3 size={16}/></button>
      <button className={`quiet-icon ${p.panel==='settings'?'active':''}`} aria-label="Open settings" onClick={()=>p.onPanel(p.panel==='settings'?null:'settings')}><Settings2 size={16}/></button>
      <div className="profile-dot">TK</div>
    </div>
  </header>
}
