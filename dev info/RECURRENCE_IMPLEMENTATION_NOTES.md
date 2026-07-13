# Recurrence Implementation Notes

This document records the recurrence failures encountered during implementation, the fixes that proved correct, and approaches that must not be repeated.

## Required invariants

- Every occurrence in a repeating set keeps the same immutable `seriesId`.
- Every occurrence keeps its original stable `occurrenceIndex`.
- Every occurrence keeps its original immutable `recurrenceDate`, `recurrenceStart`, and `recurrenceEnd` anchors.
- `This event only` affects exactly one occurrence.
- `This and all following events` affects the selected occurrence and all greater occurrence indexes.
- `All events` affects every occurrence with the same `seriesId`, regardless of earlier exceptions.
- A schedule change is absolute within its scope: changed start/end values are assigned from the selected event's final slot. Previous schedule offsets inside that scope are removed.
- Date moves preserve recurrence spacing by rebuilding dates from `recurrenceDate` plus the selected date shift.
- Non-schedule edits, such as title or notes, must not alter schedule exceptions.
- Delete-all must remain reachable from every surviving occurrence after any edit sequence.

## Issues encountered and proven fixes

### Recurrence creation and controls

The initial custom-weekly implementation did not reliably create events on several selected weekdays. It also introduced example values as defaults, required at least two weekdays, capped weeks at 52, and displayed unwanted validation text.

What worked:

- Treat daily, weekly, and multiple-days recurrence as presets of one weekly rule.
- Preselect only the event's creation weekday when entering `Multiple days a week`.
- Permit any non-empty weekday selection, including one day.
- Leave duration fields blank by default and accept unrestricted non-negative durations.
- Calculate daily occurrence count as `weeks * 7 + days`.

### Series becoming decoupled

The first `This and all following events` implementation created a new `seriesId` and reset occurrence indexes. Repeating that action split one visual series into several unrelated sets. Later all-event moves and deletes could not reach the earlier fragments.

What worked:

- Never change `seriesId` or `occurrenceIndex` during scoped edits.
- Select scope using stable occurrence indexes, not current dates or positions.
- Use one identity for deletion and editing.
- Add tests that attempt to overwrite identity fields and verify that the reducer rejects those changes.

What did not work and must not be retried:

- Splitting the series for future edits.
- Generating a new series ID for `following`.
- Reindexing the following subset from zero.
- Inferring membership from title, recurrence rule, current time, or visual proximity.

### Relative movement instead of absolute movement

The next implementation kept the set coupled but applied a shared movement delta to each occurrence. Earlier exceptions retained their offsets, so an all-event move produced several misaligned time slots.

What worked:

- For every changed schedule dimension, assign the selected event's final value directly to every in-scope occurrence.
- Assign final values only to visible `date`, `start`, and `end`; never rewrite the canonical recurrence anchors.
- For date changes, derive each new date from its canonical recurrence date rather than its already-excepted current date.

What did not work and must not be retried:

- Adding `next.start - baseStart` to every current start.
- Adding the same drag delta to prior exceptions.
- Preserving exception offsets during `following` or `all` schedule changes.
- FullCalendar-style grouped movement: its `groupId` behavior applies a shared delta and does not implement Tempo's absolute scope semantics.

### Cross-day moves collapsed adjacent occurrences

Moving event 2 back 26 hours with `following`, then moving event 1 forward 22 hours with `following`, caused event 1 and event 2 to occupy the same date and time. The reducer had rewritten `recurrenceDate` during the first move, so the second move used an already-shifted value as an identity anchor.

What worked:

- Treat `recurrenceDate`, `recurrenceStart`, and `recurrenceEnd` like Google Calendar's immutable original occurrence coordinates.
- Calculate the selected event's final date offset from its immutable `recurrenceDate`.
- Rebuild every in-scope visible date from its own immutable anchor plus that offset.

What did not work and must not be retried:

- Updating `recurrenceDate` to the moved date.
- Using a previously shifted date as the baseline of a later scoped move.
- Treating canonical anchors as the current series schedule; current schedule values belong in `date`, `start`, and `end`.

### Live title editing prompted on every letter

`EventInspector` is intentionally live-save, so opening the scope dialog for every store update created one prompt per keystroke.

What worked:

- Ask for scope once per selected recurring event and inspector session.
- Remember that scope until selection changes or the inspector closes.
- Keep the inspector live-save contract unchanged.

What did not work and must not be retried:

- Removing live-save from `EventInspector`.
- Prompting independently for every live update.

## Library research conclusion

- `rrule.js` is suitable for RFC-style occurrence generation and exclusion dates.
- `ical.js` is suitable for parsing and expanding iCalendar recurrence data.
- FullCalendar provides recurrence rendering and grouped drag behavior.
- None of these libraries implements Tempo's `only` / `following` / `all` exception reducer with absolute schedule assignment.

Do not add a recurrence dependency expecting it to fix scoped mutation behavior. A library may become useful if recurrence generation expands to complex monthly, yearly, or timezone rules, but the scope reducer and its invariants still remain application logic.

## Testing lessons and required regression process

Isolated one-step tests were insufficient. They passed while chained real-world edits still failed.

For every future recurrence change:

1. Add the exact reported interaction sequence as a failing reducer test before changing production code.
2. Assert set identity, occurrence ordering, scope boundaries, final start/end values, canonical values, and delete-all reachability.
3. Include chained `only`, `following`, and `all` operations, not only single operations.
4. Test every relevant cut/source permutation when the state space is small.
5. Include cross-day moves in both directions, especially when the second scope starts before the first scope.
6. Create a fresh recurring set in the production UI and reproduce the complete drag/resize/delete flow.
7. Verify occurrences outside the visible week by navigating to them.
8. Check browser warnings/errors, run `npm test`, run TypeScript checking, and run the production build.

Previously split persisted sets cannot be safely reconstructed automatically because the old implementation discarded their lineage. Do not heuristically merge them; that could couple unrelated events.
