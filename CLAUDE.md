# Claude Code Instructions — Tempo

## Project Understanding

Read `PROJECT.md` at the start of every session. It is the authoritative description of the app's architecture, data model, component tree, and behavioral contracts.

**Keep `PROJECT.md` up to date.** After any change that affects:
- The component tree or a component's role
- The data model (`types.ts`)
- A key behavioral contract (rename, delete, undo, draft lifecycle)
- The tech stack or persistence mechanism
- File/folder conventions

…update the relevant section of `PROJECT.md` before closing the task. Do not let the file drift from reality.

---

## Code Style

- Components are written as single-line minified JSX. Match this style when editing existing components; do not reformat to multi-line.
- All CSS is in `app/globals.css`. No CSS modules, no Tailwind.
- No comments unless the reason is non-obvious (hidden constraint, workaround, subtle invariant).
- No trailing summaries or docstrings.

## Behavioral Rules

- Floating menus (CalendarMenu, GroupMenu, EventMenu) use commit-on-blur/Enter with a cancel ref for Escape. Never make them live-save to the store.
- EventInspector title is intentionally live-save. Do not change this.
- All store mutations go through `commit()` in `useCalendarStore`. Never bypass it.
- SSR is disabled globally (`ssr: false` in `app/page.tsx`). Do not re-enable it.
