# Calendar — Project Understanding

**Keep this file current.** Update it whenever architecture, data model, key behaviors, or component roles change meaningfully. Both `CLAUDE.md` and `AGENTS.md` instruct their readers to maintain this file.

---

## What This Is

This is an optimistic time-blocking web app. Users plan their week in the **Plan** layer and record what actually happened in the **Actual** layer. Email/password-authenticated workspaces persist to normalized, user-scoped Supabase Postgres tables. React state makes edits appear immediately. IndexedDB holds the last Supabase-acknowledged workspace as a disposable read cache plus a short-lived pending-write delivery outbox; this protects interrupted saves but does not provide a general offline mode.

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
| Styling | Single flat CSS file (`app/globals.css`) — no Tailwind; semantic dark/light theme tokens |
| State | Custom hook (`useCalendarStore`) — no external state library |
| Authentication | Supabase Auth with verified email + password and unique account usernames |
| Persistence | Supabase Postgres + private Realtime Broadcast, with an acknowledged-snapshot IndexedDB cache and pending-write delivery outbox |

SSR is disabled for the entire app via `dynamic(..., { ssr: false })` in `app/page.tsx` because all state is client-only.

Appearance supports System, Light, and Dark modes. The preference is device-local in `localStorage` (`tempo-theme`), is applied to the root document before React renders to prevent a theme flash, and intentionally does not enter synchronized calendar settings or undo history. A calendar's stored color and color-editing controls remain the dark-mode ground truth. `CalendarApp` is the single presentation boundary: it derives memoized, role-specific light-mode calendar arrays through the cached, hue-preserving OKLCH transform. Event surfaces use a slightly darker, higher-chroma event role plus a theme-controlled surface mix, while all other calendar-colored UI uses one brighter non-event role. The role ranges are tuned against their final opaque or composited rendering so non-event swatches remain slightly darker than visible event fills. Raw calendars are passed separately only to color editing, persistence, and export paths, preventing derived colors from being saved. Leaf renderers never import the color model.

---

## Data Model (`lib/calendar/types.ts`)

```
CalendarData (version: 2)          ← in-memory/import-export compatibility model
├── blocks: CalendarBlock[]        ← all time blocks
├── categories: CalendarCategory[] ← user's calendars (color + visibility)
├── groups: CalendarGroup[]        ← tabs that group calendars in the sidebar
├── settings: CalendarSettings     ← user preferences
├── quoteBank: string[]
├── currentQuote: string
└── deletedCalendars?: DeletedCalendar[]  ← soft-deleted calendars

CalendarBlock
├── id, date (YYYY-MM-DD), start/end (decimal hours; timed `end` may exceed 24 for a multi-day span)
├── title, categoryId, layer ('plan'|'actual')
├── notes?, status? (ActualStatus), sourcePlanId?, allDay?
├── seriesId?, occurrenceIndex? ← recurring-series identity/order
├── recurrence? (weekly interval, selected weekdays, weeks, optional extra days)
├── recurrenceDate? ← immutable generated-date anchor for the occurrence
├── recurrenceStart?, recurrenceEnd? ← immutable generated-time anchors
└── status: 'completed'|'partial'|'skipped'|'unplanned'

CalendarCategory  — id, name, color (hex), visible, groupId?
CalendarGroup     — id, name
CalendarSettings  — wakeHour, sleepHour, snapMinutes, defaultDuration,
                    hourScale, monthScale, showWeekends, weekStartsOn (Mon=0 … Sun=6),
                    timeFormat, underlayOpacity,
                    defaultCategoryId, planLabel?, actualLabel?,
                    autoFormatTitles?, insightsExcludedCategoryIds?, favoriteCategoryIds?,
                    todoTabs?, todoItems?

TodoTab           — id, name, favorite?
TodoItem          — id, tabId, parentId?, title, notes?, expectedMinutes?,
                    linkedBlockIds?, completed?
```

The database representation is normalized rather than storing this root object as one JSON blob:

```
accounts           — one row per auth user; settings JSON, quote data, workspace revision and logical-usage metadata
applied_mutations  — private 30-day mutation ledger for idempotent retry results
workspace_tombstones — private durable delete cursors for incremental catch-up
profiles           — account username, normalized email, and effective logical-storage limit
account_entitlements — administrator-only per-email storage-limit overrides
groups             — ordered calendar tabs
calendars          — ordered calendars, visibility/color, and soft-delete timestamp
recurrence_series  — one recurrence rule per materialized recurring series
blocks             — events with times stored as compact integer minutes
block_notes        — independently synchronized non-empty event note text
```

Workspace/profile tables are scoped by `user_id`; foreign keys preserve group/calendar/series integrity and authenticated-owner RLS protects reads. Every synchronized row carries the last workspace revision that modified it. The administrator-only entitlement and synchronization tombstone tables have RLS with no client policy.

---

## Core Concepts

- **Layers** — Actual (reality) is the default layer and appears before Plan (intent) in `AppHeader`; both use the shared application accent when selected. The 1/2 shortcuts follow that order. Timed blocks belong to one visible layer; all-day blocks retain their stored layer but render in both views. "Fill from plan" copies unmatched timed planned blocks into Actual for either the displayed range or an individual day from its day-header button. Plan blocks can also appear as an opacity-adjustable underlay in Actual, with the maximum matching their Plan-view opacity.
- **Draft blocks** — A block created by dragging on the timed grid or by clicking open space in a day's all-day slot stays as a draft until it has a non-empty title or non-default category. Calendar assignment promotes the draft through the same lifecycle whether it comes from `EventInspector` or `EventMenu`. Drafts remain draggable without being persisted and are discarded on close.
- **Cross-midnight timed blocks** — Drag creation can continue into later day columns. The block remains one event anchored to its start date; `end` stores elapsed decimal hours from that date and may exceed 24 (for example, 11 PM–1 AM is `start: 23, end: 25`). Week/day and month views render a segment on each covered date, while selection, movement, resizing, recurrence, inspector edits, and persistence operate on the single block.
- **All-day blocks** — All-day blocks are always visible in both Plan and Actual and are excluded from Plan-to-Actual copying. In month view they use a filled category-colored treatment and sort ahead of timed events, ensuring they receive priority in the four visible event rows. Hovering a day's unused all-day space reveals a centered plus without changing the normal calendar cursor, and the whole open area creates an event. Populated days keep a compact add area. All-day blocks reuse `EventCard` and `EventMenu`, never render resize controls, can move between days, and can be reordered within a day; their hidden start-minute value stores that visual order. In week/day views, dragging an all-day block into the timed grid converts it to a timed block at the snapped drop time using the configured default duration, while dragging a timed block into an all-day slot converts it to all-day and places it at the indicated order.
- **Month scrolling and overflow** — Month view is a bidirectionally infinite, virtualized stream of fixed-height week rows with a visually hidden scrollbar. Only visible weeks plus a small overscan buffer are mounted. `monthScale` controls those rows through the same header slider used for hour height in week/day views and has its own Settings control. The date cell at the horizontal and vertical center of the viewport determines the focused month and updates the app anchor, header label, and sidebar mini-calendar. Clicking a day opens its containing week in Week view. Month cells show as many prioritized event rows as fit, reserving space for `+x more` only when events overflow. Compact timed labels use `h:mm` with a small-caps AM/PM suffix. The overflow control opens the shared Insights tooltip with every all-day and active-layer timed event for that date, colored by calendar and labeled with time and duration.
- **Favorite calendars** — A calendar can be favorited or unfavorited from its right-click menu. Favorite IDs persist in settings, are removed on calendar deletion, and transfer to the merge target when a favorite calendar is merged. Month cells render each event once in the order all-day, favorite timed, then ordinary timed; the overflow tooltip remains neutral with all-day events followed by all timed events chronologically. All-day and favorite timed events share the filled category-color highlight without a left accent bar.
- **Default category** — One calendar is marked default; new blocks use it automatically.
- **Calendar visibility** — Hidden calendars remain available in the calendar sidebar and Settings, but their events are omitted from week, day, and month views and they are omitted from calendar-selection dropdowns and menus.
- **Form controls** — Simple option menus use the shared app-themed `CalendarDropdown` rather than browser-native selects, keeping dark/light surfaces, selected states, and keyboard behavior consistent with the calendar. Specialized calendar assignment continues to use `CalendarSelect` and its grouped colored rows.
- **Day bounds** — The configured wake and sleep times shade unavailable hours and draw Daily-load-style dashed rules across the timed-event grid at both boundaries. The timed grid adds a viewport-sized bottom scroll buffer when needed so the configured wake time can always align with the top of the scroll pane, including tall or resized layouts.
- **Tabs (groups)** — Calendars are organized into collapsible tabs in the sidebar.
- **Drag and reorder** — Every sortable collection uses the shared `LiveSortable` core for translated in-place feedback and active-row state. Sidebar sorting is vertical: horizontal translation is discarded and sortable scroll panes clip horizontal overflow, so a dragged row cannot grow the container's scroll width. While sorting, sortable rows stop receiving pointer hover states so intermediate targets do not highlight beneath the live drag preview. Size-derived drag scaling is normalized away so text and controls never stretch while crossing containers. Calendar groups/calendars and to-do tabs/items never render detached drag-overlay bubbles; calendar events likewise move their existing event surface directly.
- **To-do lists** — The to-do header button temporarily replaces the default Weekly Insights panel and is closable back to Insights. Its heading is an inline-editable, device-local label that defaults to “To-do list” and does not rename any other app surface. A shared segmented control filters All, Unchecked, or Checked tasks, defaulting to Unchecked. Truly empty tabs remain visible in every filter so users can add tasks; non-empty tabs are hidden when none of their tasks match the active filter. Filtered nested matches retain their ancestors as structural context. A tab can be favorited from its hover-only muted star to remain visible in all three filters, while its tasks continue to follow the active filter. Compact tasks live in collapsible, sortable tabs. Items form an arbitrarily deep self-referencing tree through `parentId`; sub-items are indented and always rendered independently of the task-details chevron. Tab headers and task rows order their trailing controls as add, count/time, then chevron. Add uses the same muted resting color and hover-only visibility as the neighboring controls. Only add and chevron controls use 10px icons and 10px horizontal footprints, while checkbox/title and favorite-star spacing retain their original dimensions. Tabs and item subtrees can be reordered or moved between tabs. Vertical drag chooses the insertion point, horizontal drag adjusts the projected nesting depth, moving a parent moves every descendant atomically, and invalid self/descendant drops are rejected. Imported trees are normalized to remove missing, cross-tab, self, or cyclic parent references. Sorting uses the live transformed row only, without a duplicate drag overlay. The right-edge chevrons remain click controls for collapsing tabs or expanding task details and also participate in the same thresholded drag surface, so dragging one reorders without toggling it. Tab and task names are editable in place, and their keystrokes are isolated from the sortable keyboard sensor. New task names and unset estimate inputs stay genuinely empty, never using placeholder punctuation. An unset expected time recursively rolls up the effective expected times of direct sub-items; an explicit estimate, including zero, overrides that rollup. Compact time summaries show allocated/expected when events are linked, expected alone when there are no links, and nothing when both values are absent; a missing expected side reserves its slot only when an allocated side is present. Right-clicking a tab or task opens the shared compact action menu, which currently contains Delete; there are no inline trash controls, and Delete is disabled for the sole remaining tab. Deleting a parent removes its complete subtree in one undoable commit. Completed task names remain muted without a strikethrough. New tasks remain collapsed. Expanded tasks expose an unlabeled event-style notes box plus a single compact expected-hours and event-link/count row. Dense colored linked-event rows reuse tooltip presentation, open the existing event inspector, and remove only the link. Collapsed rows show only completion, title, and allocated/expected time. Linked allocation sums timed events and ignores all-day placeholders.
- **To-do event linking** — “Link event” enters a calendar selection mode; its compact instruction floats at the bottom of the to-do panel without reflowing tasks. A normal event click links once and exits without presenting an event list. Shift-click adds multiple events and keeps selection mode open until Shift is released after at least one handled event click, including a no-op click on an event that was already linked. Clicking an event already linked to the task never unlinks it; the linked-event row’s × is the explicit unlink control. A recurring event initially links only the clicked occurrence, then reuses the recurring-edit scope controls to broaden the same undo-history entry to “This and following” or “All events.” Deleting an event removes its task links; soft-deleting a calendar preserves them for restore.
- **Recurring blocks** — Recurrence is materialized as ordinary blocks sharing one immutable `seriesId` and stable `occurrenceIndex` values. Immutable canonical date/start/end anchors identify each generated occurrence independently of one-off moves and are never rewritten by scoped updates. The weekly rule supports selected weekdays and an unrestricted week duration; daily repeats accept weeks plus days and once-weekly repeats are presets of the same rule.

---

## State & History (`hooks/useCalendarStore.ts`)

Single custom hook. All mutations go through `commit()`, which:
1. Pushes the current state onto a `past` stack (capped at 50)
2. Clears the `future` stack
3. Applies the change

Undo/redo walk `past`/`future`. Block deletion also shows a 6-second undo toast (`store.undo`). Calendar deletion does NOT use the toast — it moves the calendar to `deletedCalendars` (soft delete, recoverable from Settings).

`commit()` is also the optimistic persistence boundary. It updates React state immediately and writes the latest pending workspace to a per-tab IndexedDB delivery outbox. Non-text edits flush immediately; title/note edits coalesce for 350 ms (with a 1.5-second maximum wait). Shared sparse-diff logic computes only changed fields against the last acknowledged snapshot, and notes map to their own `block_notes` record. `apply_patch()` accepts that snapshot's expected revision, applies the diff atomically, and records the frozen mutation ID in a durable server-side idempotency ledger. The outbox entry is removed only after acknowledgement. Page-hide/close starts an immediate best-effort flush, and a close warning is attached only while edits remain unsaved.

To-do tabs and items are synchronized inside the account settings JSON so they inherit the existing optimistic commit, quota, outbox, conflict, import/export, and undo behavior without requiring a separate persistence path. Their collapsed UI state is device-local in `localStorage`.

On startup, tabs identify live sibling tabs through `BroadcastChannel` before claiming abandoned outbox records. Abandoned edits are merged with the latest consistent Supabase checkpoint using the same deterministic three-way merge as ordinary revision conflicts. Independent field changes rebase automatically; overlapping field edits and delete-versus-edit cases require an explicit server/device choice. This is crash/reload delivery protection, not an offline product contract: the UI is not designed for extended offline use, but a pending edit remains retryable after an interrupted tab. Private Realtime Broadcast events are content-free pull hints; correctness comes from ordered database deltas, so a missed message is recovered on reconnect, focus, or the next startup without downloading the full workspace.

---

## Component Tree

```
app/page.tsx  (dynamic, ssr:false)
├── AuthScreen.tsx               ← sign-in, signup, confirmation guidance, recovery, and configuration gate
└── CalendarApp.tsx              ← authenticated root; owns UI state and keeps the cached/empty workspace visible during locked hydration
    ├── AppHeader.tsx            ← layer switch (right-click opens GroupMenu for rename), segmented month/week/day view switch, nav, tools
    ├── Sidebar.tsx              ← mini-calendar, calendar/group list, DnD reorder
    │   └── FloatingMenus.tsx   ← CalendarMenu, GroupMenu, CalendarAreaMenu
    ├── CalendarToolbar.tsx      ← quote editor, density, copy-plan-to-actual
    ├── CalendarDropdown.tsx     ← shared themed listbox for simple option menus
    ├── WeekGrid.tsx / MonthView.tsx  ← main grid; timed drag-to-create/move/resize, all-day creation/move/reorder; MonthView provides bidirectional virtual week scrolling and reports its focused month; month overflow tooltips list every event for the day; Actual day headers can fill that day from Plan
    ├── CalendarTooltip.tsx        ← shared tooltip and colored line-row renderer used by month overflow, Insights visualizations, and linked to-do events
    ├── LiveSortable.ts            ← shared in-place sortable behavior; sensors, transform, collision fallback, and active state
    ├── EventCard.tsx            ← rendered block and drag-creation preview on the grid; timed cards preserve an empty title row when the title is blank
    ├── EventInspector.tsx       ← right panel when a block is selected
    │   └── RecurrenceEditor.tsx ← daily/weekly/multiple-days repeat controls
    │       └── WeekdayPicker.tsx ← shared compact weekday selector, also used by Settings
    ├── FloatingMenus.tsx        ← EventMenu (right-click on block)
    ├── FloatingMenuCore.ts      ← shared outside-click/Escape dismissal and viewport positioning for all floating menus
    ├── TodoPanel.tsx            ← closable right panel; sortable nested task trees, inline task editing, recursive estimate rollups, notes, completion, compact linked events, and direct event-link mode
    ├── InsightsPanel.tsx        ← default weekly stats panel; accessible from the command menu/shortcut; omits calendars excluded in settings from every metric; Daily load stacks the By calendar grouped order bottom-to-top
    ├── SettingsPanel.tsx        ← settings, device-local appearance choice, collapsed weekly-insights exclusions via the shared grouped calendar list, import/export JSON, recently deleted
    ├── SearchPanel.tsx
    ├── ShortcutsPanel.tsx
    ├── CommandPalette.tsx       ← ⌘K palette
    └── ResizeHandle.tsx         ← draggable sidebar resize
```

Supporting modules in `lib/calendar/`:
- `types.ts` — all TypeScript types
- `constants.ts` — color palette, default settings
- `date.ts` — date helpers (formatTime, configurable-start weekDates/startOfWeek, toISO, etc.)
- `block-time.ts` — cross-midnight block clock conversion and per-day display segmentation
- `layout.ts` — timed-event overlap lanes, including Notion-style thin-event overlays
- `month-layout.ts` — height-based month-cell event capacity and overflow reservation
- `recurrence.ts` — series generation plus scoped update/delete transforms
- `todo.ts` — hierarchy normalization/rendering/filtering, recursive estimate rollups, subtree insert/delete/move projection, linked-time calculation, and shared recurring-link scope selection
- `seed.ts` — demo data loader + normalizer
- `color-model.ts` — color manipulation utilities plus the shared cached perceptual calendar-color transform

UI hooks:
- `hooks/useTheme.ts` — device-local System/Light/Dark preference, resolved root theme, OS-change listener, and cross-tab synchronization

Supabase modules:
- `hooks/useSupabaseAuth.ts` — persisted email/password session, signup, recovery, password update, and local sign-out
- `lib/supabase/client.ts` — singleton browser client using the publishable key
- `lib/supabase/database.ts` — database mapping, snapshot diffing, transactional patch calls, and consistent remote loading
- `lib/supabase/rows.ts` / `lib/supabase/write-policy.ts` — reusable sparse-field diffing and immediate/debounced persistence policy
- `lib/supabase/sync.ts` — strict incremental-delta validation and immutable cache application
- `lib/supabase/merge.ts` — deterministic field-level three-way merge and overlap detection
- `lib/supabase/persistence.ts` — IndexedDB acknowledged-snapshot cache and per-tab pending-write delivery outbox
- `supabase/migrations/20260714000000_database.sql` — normalized workspace schema, constraints, RLS, indexes, initial RPC, and private Broadcast triggers
- `supabase/migrations/20260714010000_password_auth_and_quotas.sql` — profiles, email entitlements, auth triggers, RPC-only writes, and transactional logical quotas
- `supabase/migrations/20260714020000_concurrency_safety.sql` — expected-revision writes and durable idempotency ledger
- `supabase/migrations/20260714030000_consistent_snapshot_reads.sql` — one-transaction normalized workspace reads
- `supabase/migrations/20260714040000_revision_broadcasts.sql` — one minimal revision invalidation per committed workspace patch
- `supabase/migrations/20260714050000_incremental_sync.sql` — per-row revision stamps, delete tombstones, and the ordered change-feed RPC
- `supabase/migrations/20260715000000_sparse_writes_and_notes.sql` — field-level mutation payloads and separate note records
- `supabase/migrations/20260719000000_multiday_blocks.sql` — permits timed and recurring block ends beyond midnight (up to seven days)

---

## Key Behavioral Contracts

### Rename
All three floating context menus (`CalendarMenu`, `GroupMenu`, `EventMenu`) share the same pattern:
- Local state tracks keystrokes; the store is **not** updated on every character
- Commit fires on **blur** or **Enter**
- **Escape** sets a `cancel` ref to prevent the blur handler from committing, then closes
- Dismiss (click outside) triggers blur first, so commit fires naturally before close

`EventInspector` title is **live-save** (every keystroke → store). This is intentional — the panel shows "Changes save automatically" and the draft-block lifecycle depends on it.

EventInspector outcome buttons are also live-save. Clicking an inactive outcome selects it; clicking the selected outcome again clears it.

### Delete
| Target | Pattern |
|---|---|
| Block (event) | Direct delete → undo toast (6 s) |
| Calendar | Confirmation dialog → soft delete (restorable from Settings) |
| Calendar merge | Confirmation dialog → immediate, recoverable via Ctrl+Z |

### Recurring events
- `Multiple days a week` preselects the event's creation weekday, permits any non-empty weekday combination, and accepts an unrestricted number of weeks. Every day and every week are presets of the same weekly rule.
- New repeat configurations have no prefilled duration. `Every day` accepts weeks and days, materializing `weeks × 7 + days` daily occurrences.
- Moving, resizing, editing, or deleting a recurring occurrence immediately applies to `This event only`. A six-second toast offers `This and all following events`, `All events`, and Undo; choosing a broader scope amends the original change so it remains one undo-history entry.
- `This event only` creates an exception without changing its siblings.
- `This and all following events` severs the series at the cut point. The head (earlier occurrences) keeps the original `seriesId` and its existing anchors. The tail (selected occurrence and all later) becomes a fully independent series with a new `seriesId`, occurrence indexes restarted from 0, and fresh immutable anchors equal to the post-move dates and times. Delete-all from a tail block removes only the tail series; delete-all from a head block removes only the head series.
- Following/all schedule transforms are absolute assignments. Every in-scope occurrence receives the selected event's final start/end values, and date moves rebuild each in-scope date from its immutable `recurrenceDate` plus the selected date shift. For `following`, the tail's new `recurrenceDate` anchors are set to the post-move dates. The canonical recurrence anchors on the head and on `only` exceptions are never rewritten. This intentionally removes prior schedule exceptions inside the chosen scope; edits to non-schedule fields leave those exceptions untouched.
- When a date move shifts the day of the week, the `recurrence.weekdays` array is shifted by the same net weekday delta on all in-scope occurrences (`following` updates the tail only; `all` updates every occurrence). Daily-mode series and shifts that are multiples of 7 days are unaffected.
- The inspector remembers a broader edit scope chosen from the toast for the selected recurring event until the inspector closes or selection changes.
- Repeat-rule changes regenerate the series atomically through `commit()`; choosing `Does not repeat` detaches the selected occurrence.

### Undo
- Ctrl+Z / Ctrl+Shift+Z traverse full undo/redo history (all `commit()` calls)
- Undo toasts cover block deletion and every scoped recurring-event edit, move, resize, or delete (the recurring-event toast also offers the two broader recurrence scopes)
- Calendar soft-delete uses Settings > Recently deleted (persistent recovery)
- An externally refreshed database snapshot clears local undo/redo history so stale snapshots cannot reverse changes made on another device. Acknowledging this client's own background writes does not clear history.

### Timed-event layout
- Overlapping substantial events divide the day into side-by-side lanes.
- When the actual time intersection is no more than 75% of the earlier/background event, the later-starting event renders across nearly the full day width instead of narrowing the background event for its entire duration. Total event durations do not determine eligibility; when starts tie, the shorter event is the foreground candidate. Foreground events that overlap one another still split into separate overlay lanes.

### Authentication and sync
- The app is gated by Supabase Auth using verified email and password. Supabase Auth stores bcrypt password hashes; application tables never receive passwords.
- A unique username is chosen during signup and used as account identity/display metadata. Login remains email + password because Supabase Auth does not natively authenticate usernames; the app does not expose a username-to-email lookup.
- Confirmation and recovery redirects use the browser origin, allowing allow-listed localhost and production origins to share one Supabase project.
- Initial session restoration and dynamic application loading use `AppLoading`; the sign-in form is rendered only after Supabase confirms there is no persisted user, preventing a false login flash. Once authenticated, `CalendarApp` always renders the calendar workspace: it begins from a neutral empty model, displays the IndexedDB cache as soon as it is available, and shows a loading toast while server validation and outbox recovery finish. Calendar interactions and store commits remain disabled during that hydration window so late-arriving data cannot overwrite user edits.
- Supabase URL and publishable key are public client configuration. Secret/service-role keys must never be exposed to the browser.
- A first-time account starts from the demo workspace and immediately creates its authoritative Supabase workspace. There is no pre-Supabase data migration path because the application has no legacy users.
- IndexedDB stores one user-qualified, Supabase-acknowledged snapshot as a disposable warm cache. A separate per-tab outbox stores only the current pending workspace, its merge base, and any frozen mutation identity until Supabase acknowledges it. Abandoned records are recovered and merged on the next app startup; active sibling tabs retain ownership of their records.
- Row-level security is the authorization boundary. Client-side `user_id` filters are additionally used for query planning/performance.
- Authenticated clients have read access but no direct table-write grants. All workspace mutations go through the hardened `apply_patch()` RPC, which derives `user_id` from `auth.uid()`, serializes writes for that user, rejects stale expected revisions, and returns the committed revision.
- A browser with no acknowledged cache bootstraps once through `get_snapshot()`, where the revision and every normalized table are observed from the same PostgreSQL statement snapshot. A cache is required to interpret later deltas; if the browser evicts it, one new bootstrap is unavoidable.
- Cached browsers call `get_changes_since(cursor)`. The workspace revision is an ordered checkpoint, changed rows carry `modified_revision`, and hard deletes leave ID-only tombstones. One statement returns the current checkpoint, final versions of rows changed after the cursor, and deleted IDs. Event metadata and note content are separate rows, so an ordinary event change never transfers its note and a note change never updates its event row.
- A delta is applied only when its `from_revision` exactly matches the cached revision. Gaps, backwards cursors, and malformed patches fail closed. The client commits the resulting checkpoint and rows to IndexedDB together as the next acknowledged cache.
- Realtime emits one small private `workspace_changed` message containing only the new revision after each committed patch. It does not broadcast every changed row, preventing recurring/bulk operations from producing redundant messages or exposing row payloads to the notification layer.
- The browser retains a complete acknowledged workspace because recurrence scopes, global search/export, soft-delete restore, and undo require it, but synchronization transfers only changed normalized rows. Realtime messages are intentionally non-durable: reconnect, focus, startup, and stale-write recovery all pull from the durable cursor/tombstone protocol, so message loss cannot create a permanent gap.
- Applied mutation IDs and payload hashes are retained for 30 days. A retry after a lost response returns the original result, while accidental mutation-ID reuse with a different payload is rejected.
- Disjoint concurrent edits are merged at field level and retried automatically. Same-field changes and delete-versus-edit conflicts never resolve silently; the app combines all non-overlapping work and asks which version wins only for the overlapping fields.
- Each account defaults to a 5 MiB logical calendar-payload quota. The RPC serializes same-user writes, adjusts usage from the touched rows inside the patch transaction, and rolls the whole patch back when it would exceed the effective per-email entitlement. A rejected change remains visible with an error state and stays in the delivery outbox so reducing data or increasing the entitlement can make it retryable.
- Soft-deleted calendars remain as calendar rows with `deleted_at`; their blocks stay normalized and are reattached on restore.

### Tests
- `npm test` runs persistent Node regression tests. Recurrence tests cover multi-day and daily generation, absolute schedule assignment, immutable canonical anchors, cross-day moves, mixed scoped edits/deletes, all pairs of successive following cuts, and all three-following permutations followed by all-events moves from every source occurrence. To-do tests cover timed allocation, recurring link scopes, hierarchy repair and filtering, recursive estimate rollups, subtree insertion/deletion, cross-tab moves, horizontal reparenting, and cycle rejection. Sync tests cover strict cursor validation, changed-row replacement, tombstones, collapsed multi-revision pulls, two-browser convergence, same-row disjoint edits, same-field conflicts, both conflict choices, delete-versus-edit conflicts, nested settings merges, and object-order stability.
- `tests/incremental-sync.sql` is a rollback-only linked-database integration test. It verifies separate event/note delta transfer, field-level event and note updates, idempotent retry, stale-browser rejection, delete tombstones, collapsed insert/delete history, and empty current-cursor pulls without leaving test data behind.

---

## File Conventions

- Components are minified to single lines (no blank lines within a component). Match this style when editing.
- Edit declarations at their canonical location whenever practical. Do not append compensating overrides to the end of a file unless the cascade layer is intentional and structurally necessary.
- When changing an interaction state, evaluate the full related state set (rest, hover, active/pressed, selected, focus, and disabled) in every supported theme, preserving the intended hierarchy rather than optimizing one state in isolation.
- All CSS lives in `app/globals.css` — no CSS modules, no Tailwind.
- No comments in source files unless the reason is non-obvious.
- `'use client'` is explicit on files that directly use hooks or browser APIs; child components of client parents are implicitly client even without the directive.
