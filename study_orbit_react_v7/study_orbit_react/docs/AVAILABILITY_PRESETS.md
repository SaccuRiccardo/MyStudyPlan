# Plan a semester around your actual week

1. Choose **Create preset** under **Weekly presets**. Start with an empty week or
   use one of the editable starting points.
2. Name the week and add study windows on the days that suit you. Add separate
   windows to leave breaks. Use **+1 day** for sessions after midnight that belong
   to the previous study day.
3. Add **Unavailable / university** windows for lectures, labs, commuting or other
   commitments. Overlapping study windows count once; unavailable time is subtracted.
   No subjects are stored in this template. Notes describe your preferences;
   use the actual windows to enforce time constraints.
4. Save it, then choose **Build semester phase**. Select your courses and priorities.
5. **Suggest hours by priority** distributes available time using your chosen study effort, or
   enter each course's hours yourself. These hours are goals, not a required total.
6. Continue to see a timetable that fits the available time. If 55 hours are wanted
   but only 42 are available, the scheduler shares those 42 hours proportionally to
   your requested goals, preserving the 55-hour request for comparison. It does not
   silently invent evening sessions or force you to reduce the numbers.
7. Edit sessions, then **Lock** any course/time allocation you want to keep. Review shows scheduled versus wanted
   hours per subject. Shortfalls are warnings: you may save a useful partial plan.
   Invalid times, overlapping sessions, or sessions conflicting with unavailable
   time remain errors.

## When university hours change

Edit the active phase, go to **Availability**, change the blocked periods, then use
**Fill timetable** in **Timetable**. You can also copy in an updated saved
preset. Locked sessions stay in place; conflicts with a new constraint must be
resolved explicitly. Fill replaces unlocked sessions with a new suggestion. Unlock a session before editing its course or times.
Unchanged sessions keep their IDs and completion; genuinely changed sessions get
new IDs so old completion is not transferred to unrelated work.

A phase keeps an independent copy of its week. Editing or deleting a saved preset
never silently changes an existing semester. Choose the updated preset explicitly
inside a phase to adopt it. The builder also offers **Save a copy as preset** so a
week designed during phase creation can be reused later.

Presets are included in autosave, portable JSON export/import and local snapshots.
Old state without presets loads with an empty preset library. Existing phase
schedules remain unchanged until edited; their flexible sessions seed availability
when opening the new builder.

## What the suggestions mean

The effort priorities (Intensive, High effort, Steady, Maintenance) only provide initial
needs. Manually requested hours take priority over those suggestions, including when sharing scarce time. Recommendations and generated sessions
use whole or half hours only (for example, 12 or 12.5 hours). Each course gets one
continuous stretch per study day; a gap ends that stretch. **Fill timetable** tries
several combinations to place useful study time while keeping locks and avoiding
scattered repeats. New study stretches must last at least **90 minutes**; among
equally full plans, the search prefers **2 hours or longer**, then balances goals
and reduces course changes. Short gaps stay free. A weekly goal below 1.5h cannot
create a standalone session. Existing locked sessions keep their exact times,
including shorter commitments; touching extensions count as one continuous stretch. Spare windows stay
available for future refits even if today's goals use only part of the week.
You can save a phase without sessions while waiting for the university timetable.

Capacity and progress use nominal scheduled time, as before. An adjacent session
can lose its first ten minutes to the preceding session's planning handoff. This is
not a measured study timer, an exam-deadline optimizer, or an automatic reader of
free-text university constraints.

## Responsiveness and buttons

Course deletion now uses an inline confirmation, updates the visible list
immediately, and saves in the background. The live clock no longer redraws the
subject library, presets or weekly calendar every second. Small changes copy only
the state sections they edit instead of cloning all saved completion history.
Subject deletion clears affected auto-fill groups in one pass.

Buttons have consistent styling, visible destructive actions, pressed feedback,
keyboard focus and reduced-motion support. The availability editor works at phone
widths and supports keyboard navigation within its dialog.

## Validation

The regression suite covers 49/42/55-hour availability, overlaps, unavailable time,
weekly wrap and overnight ownership, over/under/zero-hour goals, half-hour allocation,
fixed commitments, phase isolation, preserved needs, repeatable refits, old-state
compatibility, and malformed preset rejection.

A headless Chromium workflow additionally exercised subject-free creation, university
constraints, manual needs above capacity, back/forward retention, phase creation,
independent preset revision and duplicate-phase refitting, preset export/import,
deleting a course while the HTTP save was deliberately held back, reload
persistence, and the dashboard/editor at a 390px viewport. The deletion was visible
before its save completed; browser-driven clicks took about 150ms in this run.
These checks used isolated temporary data, not personal study files.

## Fill around your choices

In **Study needs**, set the wanted hours per course or choose **Suggest hours by
priority**, then choose **Fill timetable**. The button is also available above the
timetable, so you can adjust the suggestion as often as needed.

For example, if Mathematics must be Monday 09:00–12:00:

1. Edit a session to Mathematics, 09:00–12:00.
2. Choose **Lock**. Its course and times become read-only.
3. Choose **Fill timetable**. That session stays exactly as chosen while the search
   fills the remaining preset space. **Unlock** lets you edit it again.

Locks survive saving and reopening the app. Protected existing commitments remain
locked. A course can extend directly before/after its locked session, but cannot
reappear after a break or another course that day. Separate same-course sessions
that you explicitly lock are preserved as exceptions, with an explanation rather
than silently moving your choices.

Manual goals snap to the nearest half hour when leaving the input. Older goals
are rounded in the planner draft; the saved plan changes only when you save.
Existing unusual locked times are preserved exactly and identified as older
minute-level durations. Fill never creates new sessions of that kind. Exact old
non-half-hour totals display as H:MM rather than long fractional numbers.

Per-window labels/locations were removed from both preset and phase availability
editors. Older JSON files containing those fields remain compatible.

### How the search works

`src/lib/halfHours.js` does allocation arithmetic in integer 30-minute units.
`src/lib/fillTimetable.js` explores a bounded set of timetable alternatives, keeps
both compact sessions and fair-share alternatives, and retains only the best
version of equivalent future decisions. It rejects new stretches under 90 minutes, places useful hours first, then prefers
2h+ stretches, balances course goals and reduces switching. Stable IDs are reused for unchanged sessions.
The search is bounded to keep the UI responsive; it is a best-fit suggestion,
not a proof of a global optimum. Locks, breaks, and the single daily stretch rule
can make a goal impossible even when the raw weekly hours appear sufficient.
Those deficits remain visible, and partial plans can still be saved.

Additional regressions verify no repeated disjoint course sessions, half-hour
precision, preserved locks and stable IDs, later locked sessions, old-data
compatibility, and a complete six-course 49-hour week. The achieved fills also
match independent exhaustive enumeration on small gapped plans. The Chromium
workflow checks Fill from course allocation, manual rounding, 09:00–12:00 locking,
refilling, save/reload, unlocking and changing the course, and phone-width editing.


## Reserve time without choosing a course

In **Subjects**, select **Flexible study time**. It adds **Flexible study** to the
phase, with its own priority and weekly-hour goal. Fill treats it like a study
activity and applies the same 90-minute minimum and 2h+ preference. Use those
sessions for whichever subject needs attention that day. Its hours and completion
stay separate from named courses; reserving or completing it does not claim that
you studied a particular course. Rename it if another label suits you better.

Subject selection now uses large cards with visible included states, check marks,
keyboard toggling and room for long course names. Effort choices explain both the
priority and intended workload. Existing plans keep their priorities without any
migration or change to their saved hours. Existing schedules change only when you
refill and save the phase.
