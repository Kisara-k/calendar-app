# Tempo — Project Understanding

**Keep this file current.** Update it whenever architecture, data model, key behaviors, or component roles change meaningfully. Both `CLAUDE.md` and `AGENTS.md` instruct their readers to maintain this file.

---

## What This Is

Tempo is a local-first time-blocking calendar app. Users plan their week in the **Plan** layer and record what actually happened in the **Actual** layer. No backend — all state lives in `localStorage` under the key `tempo-calendar-v2`.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + TypeScript 5 |
| Drag and drop | @dnd-kit/core + @dnd-kit/sortable |
| Title casing | @danielhaim/titlecaser (AP style) |
| Icons | lucide-react |
| Color picker | react-colorful |
| Styling | Single flat CSS file (`app/globals.css`) — no Tailwind |
| State | Custom hook (`useCalendarStore`) — no external state library |

SSR is disabled for the entire app via `dynamic(..., { ssr: false })` in `app/page.tsx` because all state is client-only.

---

## Data Model (`lib/calendar/types.ts`)

```
CalendarData (version: 2)          ← root persisted object
├── blocks: CalendarBlock[]        ← all time blocks
├── categories: CalendarCategory[] ← user's calendars (color + visibility)
├── groups: CalendarGroup[]        ← tabs that group calendars in the sidebar
├── settings: CalendarSettings     ← user preferences
├── quoteBank: string[]
├── currentQuote: string
└── deletedCalendars?: DeletedCalendar[]  ← soft-deleted calendars

CalendarBlock
├── id, date (YYYY-MM-DD), start/end (decimal hours)
├── title, categoryId, layer ('plan'|'actual')
├── notes?, status? (ActualStatus), sourcePlanId?, allDay?
├── seriesId?, occurrenceIndex? ← recurring-series identity/order
├── recurrence? (weekly interval, selected weekdays, weeks, optional extra days)
├── recurrenceDate? ← canonical generated date, retained by one-off exceptions
├── recurrenceStart?, recurrenceEnd? ← canonical series times for scoped transforms
└── status: 'completed'|'partial'|'skipped'|'unplanned'

CalendarCategory  — id, name, color (hex), visible, groupId?
CalendarGroup     — id, name
CalendarSettings  — wakeHour, sleepHour, snapMinutes, defaultDuration,
                    hourScale, showWeekends, timeFormat, underlayOpacity,
                    defaultCategoryId, planLabel?, actualLabel?,
                    autoFormatTitles?
```

---

## Core Concepts

- **Layers** — Plan (intent) vs Actual (reality). Toggled in `AppHeader`. Blocks belong to one layer. "Copy Plan to Actual" bulk-copies unmatched blocks.
- **Draft blocks** — A block created by dragging on the grid stays as a draft until it has a non-empty title or non-default category. Drafts are discarded on close.
- **Default category** — One calendar is marked default; new blocks use it automatically.
- **Tabs (groups)** — Calendars are organized into collapsible tabs in the sidebar.
- **Recurring blocks** — Recurrence is materialized as ordinary blocks sharing one immutable `seriesId` and stable `occurrenceIndex` values. Canonical date/start/end fields identify each generated occurrence independently of one-off moves. The weekly rule supports selected weekdays and an unrestricted week duration; daily repeats accept weeks plus days and once-weekly repeats are presets of the same rule.

---

## State & History (`hooks/useCalendarStore.ts`)

Single custom hook. All mutations go through `commit()`, which:
1. Pushes the current state onto a `past` stack (capped at 50)
2. Clears the `future` stack
3. Applies the change

Undo/redo walk `past`/`future`. Block deletion also shows a 6-second undo toast (`store.undo`). Calendar deletion does NOT use the toast — it moves the calendar to `deletedCalendars` (soft delete, recoverable from Settings).

---

## Component Tree

```
app/page.tsx  (dynamic, ssr:false)
└── CalendarApp.tsx              ← root; owns all UI state (layer, view, selection, panels, menus)
    ├── AppHeader.tsx            ← layer switch (right-click opens GroupMenu for rename), nav, tools
    ├── Sidebar.tsx              ← mini-calendar, calendar/group list, DnD reorder
    │   └── FloatingMenus.tsx   ← CalendarMenu, GroupMenu, CalendarAreaMenu
    ├── CalendarToolbar.tsx      ← quote editor, density, copy-plan-to-actual
    ├── WeekGrid.tsx / MonthView.tsx  ← main grid; drag-to-create, drag-to-move, resize
    ├── EventCard.tsx            ← rendered block on the grid
    ├── EventInspector.tsx       ← right panel when a block is selected
    │   └── RecurrenceEditor.tsx ← daily/weekly/multiple-days repeat controls
    ├── RecurrenceScopeDialog.tsx ← recurring edit/move/resize/delete scope picker
    ├── FloatingMenus.tsx        ← EventMenu (right-click on block)
    ├── InsightsPanel.tsx        ← weekly stats panel
    ├── SettingsPanel.tsx        ← settings + import/export JSON + recently deleted
    ├── SearchPanel.tsx
    ├── ShortcutsPanel.tsx
    ├── CommandPalette.tsx       ← ⌘K palette
    └── ResizeHandle.tsx         ← draggable sidebar resize
```

Supporting modules in `lib/calendar/`:
- `types.ts` — all TypeScript types
- `constants.ts` — color palette, default settings
- `date.ts` — date helpers (formatTime, weekDates, toISO, etc.)
- `recurrence.ts` — series generation plus scoped update/delete transforms
- `seed.ts` — demo data loader + normalizer
- `color-model.ts` — color manipulation utilities

---

## Key Behavioral Contracts

### Rename
All three floating context menus (`CalendarMenu`, `GroupMenu`, `EventMenu`) share the same pattern:
- Local state tracks keystrokes; the store is **not** updated on every character
- Commit fires on **blur** or **Enter**
- **Escape** sets a `cancel` ref to prevent the blur handler from committing, then closes
- Dismiss (click outside) triggers blur first, so commit fires naturally before close

`EventInspector` title is **live-save** (every keystroke → store). This is intentional — the panel shows "Changes save automatically" and the draft-block lifecycle depends on it.

### Delete
| Target | Pattern |
|---|---|
| Block (event) | Direct delete → undo toast (6 s) |
| Calendar | Confirmation dialog → soft delete (restorable from Settings) |
| Calendar merge | Confirmation dialog → immediate, recoverable via Ctrl+Z |

### Recurring events
- `Multiple days a week` preselects the event's creation weekday, permits any non-empty weekday combination, and accepts an unrestricted number of weeks. Every day and every week are presets of the same weekly rule.
- New repeat configurations have no prefilled duration. `Every day` accepts weeks and days, materializing `weeks × 7 + days` daily occurrences.
- Moving, resizing, deleting, or editing a recurring occurrence prompts for `Only this event`, `This and all following events`, or `All events`.
- `Only this event` creates an exception without changing its siblings.
- `This and all following events` changes the selected occurrence and later occurrence indexes without changing their `seriesId` or indexes. Scoped edits never sever the original repeating set.
- Following/all schedule transforms are absolute assignments. Every in-scope occurrence receives the selected event's final start/end values, and date moves rebuild each in-scope date from its canonical recurrence date plus the selected date shift. This intentionally removes prior schedule exceptions inside the chosen scope; edits to non-schedule fields leave those exceptions untouched.
- The inspector remembers the chosen edit scope for the selected recurring event until the inspector closes or selection changes, keeping live-save title editing to one scope prompt.
- Repeat-rule changes regenerate the series atomically through `commit()`; choosing `Does not repeat` detaches the selected occurrence.

### Undo
- Ctrl+Z / Ctrl+Shift+Z traverse full undo/redo history (all `commit()` calls)
- Undo toast is only for block deletion (surface-level convenience)
- Calendar soft-delete uses Settings > Recently deleted (persistent recovery)

### Tests
- `npm test` runs persistent Node regression tests. Recurrence tests cover multi-day and daily generation, absolute canonical schedule assignment, mixed scoped edits/deletes, all pairs of successive following cuts, and all three-following permutations followed by all-events moves from every source occurrence. Every sequence asserts immutable set identity, stable occurrence ordering, scope boundaries, and delete-all reachability from every surviving occurrence.

---

## File Conventions

- Components are minified to single lines (no blank lines within a component). Match this style when editing.
- All CSS lives in `app/globals.css` — no CSS modules, no Tailwind.
- No comments in source files unless the reason is non-obvious.
- `'use client'` is explicit on files that directly use hooks or browser APIs; child components of client parents are implicitly client even without the directive.
