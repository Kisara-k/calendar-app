export type Layer = 'plan' | 'actual'
export type ViewMode = 'day' | 'week' | 'month'
export type Panel = 'event' | 'insights' | 'settings' | 'search' | 'shortcuts' | null
export type UtilityPanel = Exclude<Panel, 'event'>
export type ActualStatus = 'completed' | 'partial' | 'skipped' | 'unplanned'
export type RecurrenceScope = 'only' | 'following' | 'all'
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type RecurrenceRule = {
  frequency: 'weekly'
  interval: number
  weekdays: number[]
  weeks: number
  days?: number
  mode?: 'daily' | 'weekly' | 'multiple'
}

export type CalendarCategory = {
  id: string
  name: string
  color: string
  visible: boolean
  groupId?: string
}

export type CalendarGroup = { id:string; name:string }

export type DeletedCalendar = { category: CalendarCategory; blocks: CalendarBlock[]; deletedAt: string }

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
  seriesId?: string
  recurrence?: RecurrenceRule
  occurrenceIndex?: number
  recurrenceDate?: string
  recurrenceStart?: number
  recurrenceEnd?: number
}

export type CalendarSettings = {
  wakeHour: number
  sleepHour: number
  snapMinutes: 5 | 10 | 15 | 30
  defaultDuration: number
  density: 'compact' | 'default' | 'comfortable'
  hourScale: number
  defaultCategoryId: string
  showWeekends: boolean
  weekStartsOn: Weekday
  timeFormat: '12h' | '24h'
  underlayOpacity: number
  planLabel?: string
  actualLabel?: string
  autoFormatTitles?: boolean
  insightsExcludedCategoryIds?: string[]
  userFirstName?: string
  userLastName?: string
}

export type CalendarData = {
  version: 2
  blocks: CalendarBlock[]
  categories: CalendarCategory[]
  groups: CalendarGroup[]
  settings: CalendarSettings
  quoteBank: string[]
  currentQuote: string
  deletedCalendars?: DeletedCalendar[]
}
