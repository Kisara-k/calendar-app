# Recurrence Implementation Notes

This document records the recurrence failures encountered during implementation, the fixes that proved correct, and approaches that must not be repeated.

## Required invariants

- Every occurrence in a repeating set keeps the same immutable `seriesId`.
- Every occurrence keeps its original stable `occurrenceIndex`.
- Every occurrence keeps its original immutable `recurrenceDate`, `recurrenceStart`, and `recurrenceEnd` anchors.
- `This event only` affects exactly one occurrence.
- `This and all following events` severs the series at the cut point. The head (earlier occurrences) keeps the original `seriesId` unchanged. The tail (selected occurrence and later) becomes a new, fully independent series with a new `seriesId`, occurrence indexes restarted from 0, and new immutable anchors equal to their post-move dates and times. After the split, each series is self-contained: delete-all from any tail block removes only the tail series; delete-all from any head block removes only the head series.
- `All events` affects every occurrence with the same `seriesId`, regardless of earlier exceptions.
- A schedule change is absolute within its scope: changed start/end values are assigned from the selected event's final slot. Previous schedule offsets inside that scope are removed.
- Date moves rebuild each in-scope occurrence's date from its immutable `recurrenceDate` anchor plus the selected date shift. For `following`, the tail's new `recurrenceDate` anchors are set equal to the post-move dates (fresh anchors for the new series).
- When a date move changes the day of the week, the recurrence rule's `weekdays` array is shifted by the same net weekday delta on every in-scope occurrence. For `following`, only the tail gets updated weekdays; the head keeps the original weekdays. For `all`, every occurrence gets the shifted weekdays.
- Non-schedule edits, such as title or notes, must not alter schedule exceptions.
- `This event only` does NOT rewrite the canonical recurrence anchors.

## Issues encountered and proven fixes

### Recurrence creation and controls

The initial custom-weekly implementation did not reliably create events on several selected weekdays. It also introduced example values as defaults, required at least two weekdays, capped weeks at 52, and displayed unwanted validation text.

What worked:

- Treat daily, weekly, and multiple-days recurrence as presets of one weekly rule.
- Preselect only the event's creation weekday when entering `Multiple days a week`.
- Permit any non-empty weekday selection, including one day.
- Leave duration fields blank by default and accept unrestricted non-negative durations.
- Calculate daily occurrence count as `weeks * 7 + days`.

### Series becoming decoupled (old approach — now intentional for following)

The first `This and all following events` implementation created a new `seriesId` and reset occurrence indexes. Repeating that action split one visual series into several unrelated sets. Later all-event moves and deletes could not reach the earlier fragments.

The second approach fixed this by keeping one `seriesId` for all scoped edits. However, users then expected "This and all following events" to fully disconnect the tail so that subsequent "All events" operations on head or tail would not cross-contaminate each other.

What works now:

- `following` splits at the cut point. The tail becomes an independent series.
- Each resulting series is self-contained: `delete-all` from any block removes exactly the blocks in that block's series.
- `all-events` moves and deletes work within one series at a time, which is the correct behavior after a split.

What does not apply to this new design:

- The old concern about "later all-event moves not reaching earlier fragments" is resolved because the split is intentional and explicit. Users who want cross-series edits must use separate operations on each series.

### Relative movement instead of absolute movement

The next implementation kept the set coupled but applied a shared movement delta to each occurrence. Earlier exceptions retained their offsets, so an all-event move produced several misaligned time slots.

What worked:

- For every changed schedule dimension, assign the selected event's final value directly to every in-scope occurrence.
- Assign final values only to visible `date`, `start`, and `end`; never rewrite the canonical recurrence anchors (except in the `following` tail, which gets fresh anchors equal to its post-move values).
- For date changes, derive each new date from its canonical recurrence date rather than its already-excepted current date.

What did not work and must not be retried:

- Adding `next.start - baseStart` to every current start.
- Adding the same drag delta to prior exceptions.
- Preserving exception offsets during `following` or `all` schedule changes.

### Weekday shift on date moves

When a date move shifts the day of the week (e.g., Tuesday → Wednesday is +1), the `recurrence.weekdays` array must reflect the new pattern. Without this update, the recurrence label and weekday picker in the inspector show stale days.

What worked:

- Compute `netShift = ((dayShift % 7) + 7) % 7` to normalize negative or multi-week shifts.
- For `all` scope: apply `netShift` to every block's `recurrence.weekdays`.
- For `following` scope: apply `netShift` only to the tail series; head keeps original weekdays.
- For `only` scope: do not update weekdays (single-occurrence exception, not a rule change).
- For daily-mode (`mode === 'daily'`, all 7 weekdays selected): skip the shift entirely — all days are always covered.
- For a shift that is a multiple of 7 days: `netShift === 0`, so weekdays are unchanged.

### Cross-day moves collapsed adjacent occurrences (old concern)

With the old "no-sever" design, moving event 2 back 26 hours with `following`, then moving event 1 forward 22 hours with `following`, caused events 1 and 2 to occupy the same date. The reducer had rewritten `recurrenceDate` during the first move.

With the new design this scenario is different: the first `following` splits the series into head=[event1] and tail=[event2..N]. The second `following` on event1 splits the head into an empty head and a new single-event series for event1. The two events are in different series and may share a date — which is the user's explicit choice.

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
5. Include weekday-shift assertions whenever a date move is involved.
6. Create a fresh recurring set in the production UI and reproduce the complete drag/resize/delete flow.
7. Verify occurrences outside the visible week by navigating to them.
8. Check browser warnings/errors, run `npm test`, run TypeScript checking, and run the production build.

Previously split persisted sets cannot be safely reconstructed automatically because the old implementation discarded their lineage. Do not heuristically merge them; that could couple unrelated events.
