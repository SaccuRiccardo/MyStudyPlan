# Study Orbit v7 functional review

This review describes the first functional-fix pass. The newer
[availability-first planner](AVAILABILITY_PRESETS.md) supersedes the exact-hour
validation and original five-step builder described below: it adds a sixth
availability step and treats hour shortfalls as warnings. Existing saved phase
schedules are retained until edited.

## Architectural verdict

React + a loopback Express API + ordinary JSON files is a suitable base for this
single-user planner. A database or extra framework would add maintenance work
without solving the immediate problems. The important boundaries are now explicit:

- `src/lib/subjects.js`: reusable subject identities and library changes.
- `src/lib/planner.js`: isolated phase drafts, allocation and feasibility checks.
- `src/lib/time.js`: local calendar dates, study-day offsets and live handoffs.
- `src/lib/progress.js`: marked completion for a particular phase and study week.
- `src/App.jsx`: coordinates views and serializes debounced client saves.
- `server/storage.js`: validates data and serializes complete filesystem operations.

Short `/** @brief ... */` comments describe the purpose of functions. Formatting
expands the previously compressed JavaScript/JSX so the steps can be read and edited.
This is still a small application: App and PhasePlanner are its largest components;
further extraction can follow concrete needs rather than adding abstraction now.

## Data model and deliberate behavior

`subjects` is a persistent shared library. A stable subject ID connects phase
memberships and next-step notes. Shared name/color changes propagate to memberships;
phase-specific tiers, target hours and slots remain independent. A library tier is
a default for new memberships, not an instruction to rewrite existing phases.

Removing a subject from a planner draft removes it only from that phase. Deleting
it from the library explicitly confirms removing references from all phases,
including mandatory blocks and the next-step note. A phase can become empty after
this action; it remains editable. Deleting a phase retains its subjects in the
library. Duplicating a phase gives it independent phase/block identities, keeps
fixed commitments, and makes inherited protected blocks editable.

Times are minutes relative to the **study day**: Monday 1500 means Tuesday 01:00.
Weekly conflict detection includes the Sunday/Monday boundary. Local calendar
construction avoids converting dates through UTC. Handoffs last ten minutes;
touching sessions keep their nominal end and start later. A session entirely
consumed by a handoff is skipped and does not create another phantom handoff.

Priority weighting is a suggestion. Fixed/protected hours are reserved before
suggesting the remaining hours. Manual allocations can intentionally give an SS
subject fewer hours than a B subject. Auto-fill uses the available blocks and
reports unmet subject targets at review; it does not invent evening study time.
Nominal scheduled hours include the time consumed by adjacent handoffs.

Progress is **marked-complete nominal hours**, not timed effort. It is keyed by
phase, study date and block. There is no measured study timer. Notes for a subject
are shared across phases; optional after-hours reminders are shared by date.

## Specification coverage and evidence

“Browser” below means exercised in headless Chromium, using a separate temporary
state directory. “Regression” means executed assertions, not just build success.

| Specification   | Assessment / evidence                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SUB-01–07       | Shared library added; create/reuse exercised in browser, rename/delete and independent phase priorities covered by regression. No arbitrary hard subject limit imposed.                                                                     |
| PHA-01–10       | Independent drafts and deep copies; create/duplicate/switch through browser workflow; active phase normalized; empty first run supported. Rename/delete inspected; cross-phase isolation tested.                                            |
| Guided creation | All five steps exercised in browser. Draft survives back/forward because it lives above step-specific fields. Validation blocks saving inconsistent schedules.                                                                              |
| HRS-01–08       | Weighted/manual allocation, fixed commitments, totals and per-subject feedback. Regressions verify fixed minimums and priority overrides. Scheduled/requested/marked hours are displayed separately.                                        |
| TIM-01–12       | Seven study-day tabs, editable slots, offsets, breaks and fixed/protected flags. Overnight, multi-block overlap, weekly wrap and repeated auto-fill regressions pass. Selected days sort by study-day minutes.                              |
| DASH-01–10      | One-second clock resolves current/next events without refresh. Adjacent/overnight/skipped-session logic tested. Live UI inspected through browser startup; no exhaustive real-time clock simulation in browser.                             |
| NXT-01–10       | Ten-minute default; editable, dismissible, autosaved notes keyed by shared subject. Browser verified retrieval after duplication and persistence after reload. Automatic handoff boundaries tested as pure date calculations.               |
| PRG-01–08       | Completion toggle exercised in browser. Week/phase separation and undo covered by regression. Daily and subject marked totals added. No measured timer is claimed.                                                                          |
| MED-01–10       | Add/edit/delete favorites, supported YouTube embedding, external links and stop controls. Browser verified add/edit/persistence. Actual third-party streaming and autoplay permissions were not tested.                                     |
| STA-01–10       | Empty initialization, queued autosave, atomic JSON replacement, import/export and errors. Browser verified reload/export. Supported old imports tested with available fixtures; malformed/future imports rejected before replacement.       |
| BAK-01–09       | Browser verified create/list/confirmed restore/reload. Filesystem tests cover complete directory copies, concurrency, corrupt snapshot rejection and unchanged active state after validation failure.                                       |
| UI-01–10        | Existing themes/responsive styles retained. Modal focus trapping, Escape and focus restoration added. Keyboard workflow checked; contrast, all small-screen layouts and fullscreen need manual visual testing.                              |
| SYS-01–10       | Actual launcher starts services and waits for readiness. Added port-conflict checks, readiness timeout and failure exit reporting; shutdown inspected and exercised. Desktop browser opening is not verifiable in a headless cloud session. |

## Bugs corrected

- Repeated legacy slot IDs made editing target the wrong day and confused live
  highlights. New presets have unique IDs; normalization migrates old completion
  keys using their actual study date and is idempotent.
- Overlap validation changed its loop index to terminate, potentially reading past
  the array when three blocks overlapped. It now uses a pure interval comparison.
- Presets checked protected conflicts only within one study day. Conflict checks
  now use recurring weekly intervals.
- Short blocks consumed by the preceding handoff appeared as upcoming sessions and
  generated handoffs despite never becoming active. They are now skipped.
- Subjects could not be reused across independently created phases. The persistent
  shared library now provides stable identities and phase selection.
- Tier suggestions could allocate fewer hours than mandatory commitments. Mandatory
  time is now reserved first; insufficient budgets remain visible as infeasible.
- Auto-fill could discard unused capacity at the end of a generated slot. Generated
  slots remember that range for repeat allocation; explicit edits clear stale metadata.
- Autosave, backup and restore could race while directories were renamed. The server
  now queues complete operations, and client import waits for existing saves before
  replacing state. Invalid imports cannot replace the visible workspace before saving.
- JSON export and favorite editing were absent; both are now available in the UI.
- Completion labels implied measured work. They now say marked complete.
- Launcher could announce success after a readiness timeout or hide child exit
  failures. It now fails clearly and stops its children.

## Remaining practical limits

- This remains a single-user, single-writer app. Two tabs/machines can overwrite each
  other's whole-state edits; serialization prevents partial operations, not stale edits.
- Autosave is debounced. Closing with unsaved/failed edits warns, but forcibly killing
  the browser can still lose the last edits. Export/snapshot waits for pending saves.
- Atomic rename protects ordinary write/restore failures, not every sudden power loss
  or process crash between directory renames. No filesystem journal/fsync recovery
  protocol was added. Keep independent exported copies for irreplaceable data.
- Saved completion uses the current timetable's nominal durations; editing an old
  block can change its displayed marked hours. Historical measured effort needs a
  separate immutable activity log if a real timer is introduced.
- Some legacy exports may use progress-key formats absent from this repository's
  fixtures. Test a copy of your actual old export before deleting its original.
- Automatic allocation is a transparent greedy suggestion, not an optimal scheduling
  solver. Apply a preset again or add available slots if an entire empty day was
  discarded by a previous underfilled allocation. Review explains remaining deficits.
- YouTube/provider restrictions, actual desktop browser launch, fullscreen, detailed
  contrast and physical small-screen usability need manual checks on your computer.

## Validation result

18 individual tests passed with no skips or failures; the production build and
launcher syntax checks passed. Chromium completed the workflow, dark-theme
persistence check and 390px viewport overflow check without page errors. The
launcher rejected an occupied API port with a failing exit status.

## Reproducing validation

From `study_orbit_react_v7/study_orbit_react`:

```sh
npm test
npm run build
# Node 24 in this cloud can report only file-level results in isolated test mode.
# This executes and enumerates every test assertion explicitly:
node --test --test-isolation=none tests/*.test.js
bash -n run.sh
```

The Chromium workflow was additionally exercised with Playwright installed outside
the repository and system Chromium; it never used personal Current_State data.
Tests use temporary directories. Never run destructive workflow checks against your
personal state; use STUDY_ORBIT_DATA_ROOT to select a temporary directory.
