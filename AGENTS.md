# Agent Instructions — Tempo

## Project Understanding

Read `PROJECT.md` before starting any task. It contains the architecture, data model, component tree, and behavioral contracts for this app.

**Keep `PROJECT.md` up to date.** After completing any task that changes:
- The component tree or a component's role
- The data model (`lib/calendar/types.ts`)
- A key behavioral contract (rename, delete, undo, draft lifecycle)
- The tech stack or persistence mechanism
- File/folder conventions

…update the relevant section of `PROJECT.md`. The file must reflect the current state of the codebase, not a snapshot from when it was written.

---

## Code Style

- Existing components are single-line minified JSX. Match this format when editing them.
- All CSS is in `app/globals.css`. No CSS modules, no Tailwind.
- No comments unless the WHY is non-obvious.

## Behavioral Rules

- All floating context menus (CalendarMenu, GroupMenu, EventMenu) commit on blur/Enter with a cancel ref for Escape. Never add live-save to these.
- EventInspector is intentionally live-save. Do not change this.
- All store mutations must go through `commit()` in `useCalendarStore`.
- SSR is globally disabled. Do not re-enable it.
