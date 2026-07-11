export type Layer = 'plan' | 'actual'
export type ViewMode = 'day' | 'week' | 'month'
export type Panel = 'event' | 'insights' | 'settings' | 'search' | 'shortcuts' | null
export type UtilityPanel = Exclude<Panel, 'event'>
export type ActualStatus = 'completed' | 'partial' | 'skipped' | 'unplanned'

export type CalendarCategory = {
  id: string
  name: string
  color: string
  visible: boolean
}

export type CalendarBlock = {
  id: string
  date: string
  start: number
  end: number
  title: string
  categoryId: string
  layer: Layer
  notes?: string
  allDay?: boolean
  sourcePlanId?: string
  status?: ActualStatus
}

export type CalendarSettings = {
  wakeHour: number
  sleepHour: number
  snapMinutes: 5 | 10 | 15 | 30
  defaultDuration: number
  density: 'compact' | 'default' | 'comfortable'
  showWeekends: boolean
  timeFormat: '12h' | '24h'
  underlayOpacity: number
}

export type CalendarData = {
  version: 2
  blocks: CalendarBlock[]
  categories: CalendarCategory[]
  settings: CalendarSettings
}
