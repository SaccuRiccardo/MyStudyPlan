# Study Orbit v7 — React + Local JSON State

A refactor of **Study Orbit v6** into React with Vite, modular components, and a **minimal local Express file service**. It stores your study plan in ordinary JSON files on your computer. Nothing is sent to a remote database, and you do not need an account.

## 1. Run on Linux, Windows or macOS

Follow the [project startup guide](../../README.md#start-on-your-computer) for
prerequisites, operating-system instructions, data protection and troubleshooting.
Download and extract the complete repository, then use its root launcher:

| System | Command from the repository root |
| --- | --- |
| Windows | Double-click `Start Study Orbit.cmd`, or run it from Command Prompt |
| macOS | Double-click `Start Study Orbit.command`, or `bash "Start Study Orbit.command"` |
| Linux | `bash study_orbit_react_v7/study_orbit_react/run.sh` |

Node.js >=20.19 and npm are required (current LTS recommended). Linux's Bash
launcher also needs `curl`; `xdg-open` opens the browser when available. The
Windows launcher uses Node directly, without WSL or a PowerShell policy change.
It checks both ports, prepares packages, starts Express and Vite, waits for
readiness, and opens the default browser. Keep the terminal open; Ctrl+C stops
its services. First launch needs npm registry access. Never share a `node_modules`
folder between operating systems.

When already in **this application directory**, use `bash run.sh` on Linux/macOS,
or `node scripts/start.mjs` on Windows. The API binds to 127.0.0.1:8766 and the
frontend to 127.0.0.1:5173. Open http://127.0.0.1:5173/ if the browser does not open.

### Architecture

```text
study_orbit_react/
├── run.sh                         # one-command launcher, install, cleanup
├── package.json                   # React, Vite, Express, lucide-react
├── vite.config.js                 # Vite dev server and /api proxy
├── index.html
├── .gitignore                     # keep personal state and backups untracked
├── Current_State/
│   └── state.json                 # active on-disk application state
├── Backups/
│   └── <phase>__<local-date-time>__<hash>/  # created by Save State
│       └── state.json             # complete snapshot of Current_State/
├── server/
│   ├── index.js                   # local Express REST endpoints
│   └── storage.js                 # safe file operations and snapshots
├── public/
│   └── favicon.svg
├── src/
│   ├── main.jsx                  # React root
│   ├── App.jsx                   # application logic, initialization, persistence
│   ├── Layout.jsx                # persistent dashboard shell
│   ├── styles.css
│   ├── components/
│   │   ├── Sidebar.jsx           # phases, theme, progress, shortcuts
│   │   ├── DashboardWidget.jsx   # current block, countdown, resume note
│   │   ├── NextBlock.jsx         # next session and note
│   │   ├── WeeklySchedule.jsx    # day selector, sessions, goals, progress
│   │   ├── AllocationCard.jsx    # weekly subject hours
│   │   ├── FocusShelf.jsx        # favorite audio/video links
│   │   ├── NextStepModal.jsx     # 10-minute end-of-block planning
│   │   ├── PhasePlanner.jsx      # availability-first phase builder
│   │   └── BackupManager.jsx     # save/list/restore/import UI
│   ├── hooks/
│   │   └── useClock.js
│   └── lib/
│       ├── api.js                # fetch client for local REST API
│       ├── audio.js              # audio URL parsing/embedding
│       ├── time.js               # weekday, overnight, handoff calculations
│       ├── planner.js            # tier allocation, auto-fill, validation
│       └── legacy.js             # v6/v7 import validation
└── tests/
    ├── planner.test.js
    └── storage.test.js
```

> `Backups/<phase>__<local-date-time>__<hash>/` is a directory snapshot **of the entire contents of `Current_State/`**. If you add other regular files there, Save State copies those too. The server rejects symlinks in backup source/destination trees.

## 2. How to use

**Phases:** Add your subjects → choose an effort priority (Intensive / High effort / Steady / Maintenance) → assign weekly hours → edit time slots and night-owl/3+2+2 presets → review differences and save. Create, edit, duplicate, delete and switch phases at any time. Protected mandatory lab/project blocks remain locked when editing the an existing phase.

**Live sessions:** The current subject, upcoming subject, countdown, goals, completed blocks and subject allocations update live. Each session ends with a **10-minute next-step handoff**; if sessions touch, the next block begins 10 minutes late. Notes follow the **subject**, so they reappear on its next occurrence, including when the next block is on another day. Evening study is never silently added.

**Focus Shelf:** Save named YouTube videos/playlists and external audio links. YouTube videos play inside the page when the video allows embedding; external links open in a new tab. Playback may require a click depending on browser autoplay policies.

**Save State:** Creates a folder such as `Backups/Winter exams__2026-11-04_18-25-30_UTC+01-00__07eaf551/` and copies the complete `Current_State/` tree into it. **Backups** in the UI lists snapshots; **Restore** copies one back, replacing the active folder. Changes to JSON state are otherwise autosaved to `Current_State/state.json` after a short debounce. The UI waits for queued edits to finish before making or restoring a snapshot.

**Fresh installs:** The app creates empty local state on first launch. No subjects, phases, playlists, notes, completion records, presets or backups are bundled. Each installation keeps its own data.

## 3. Migrating from Study Orbit v6

**Important:** v6 stored its state in Firefox `localStorage` at `http://127.0.0.1:8765`. v7 uses actual files and opens at `http://127.0.0.1:5173`. Browsers isolate these two addresses, so an automatic transfer is not possible.

1. Open **v6** at `http://127.0.0.1:8765`, using the same Firefox profile where your data lives.
2. Click v6's **Export JSON** button (⇩). Save the downloaded file somewhere safe.
3. Launch the **v7 React application** using `./run.sh`.
4. Click **Backups → Import v6/v7 JSON** and choose your exported JSON file.
5. Optionally click **Save State** immediately to make your first directory snapshot.

The import preserves v6's phases, subject tiers, custom slots, completion records, per-subject handoffs, optional notes, playlists and theme. The old v6 copy is not modified. Do not delete the v6 browser data until you confirm the imported information is correct.

If you have no export, start a new plan. Incomplete v5 exports cannot reconstruct a timetable; export a full v6/v7 backup from your old installation first.

## 4. File API

The Express app intentionally only handles local JSON and directory copies.

| Method | Route | Function |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/state` | Read `Current_State/state.json` |
| `PUT` | `/api/state` | Atomically replace `state.json` |
| `GET` | `/api/backups` | List completed snapshot directories |
| `POST` | `/api/backups` | Snapshot the entire `Current_State/` folder |
| `POST` | `/api/backups/:name/restore` | Restore a validated snapshot |

The API binds to **127.0.0.1**, not to a public network interface. State-changing requests require JSON, and requests from unrecognized browser Origins are rejected. The backup name is strictly validated; clients cannot supply arbitrary filesystem paths.

## 5. Developer commands

```bash
npm install       # if not installed yet
npm test          # native Node.js tests: no dependencies needed
npm run server    # only the Express API
npm run dev       # only the Vite frontend (expects backend on 8766)
npm run build     # create production frontend files in dist/
```

The tests cover synthetic phase fixtures, tier-weighted allocation, overnight schedules, the 10-minute handoff priority, conflicting slots, atomic writes, and directory backups/restores. The automated tests use a separate temporary state directory; they do not touch your personal `Current_State/`.

### Caveats

- This is a **single-user local application**. Two tabs editing the same state simultaneously may overwrite each other's changes (last write wins).
- The launcher requires Node.js and internet access to download npm dependencies on the first run; no attempt is made to silently use `sudo` to install a system-level Node runtime.
- Only import JSON exports from sources you trust. JSON is data, not executable JavaScript; the frontend normalizes imported state.
- The schedule's weekly-hour target counts the nominal durations of study blocks. If the handoff consumes the beginning of an adjacent block, the effective focused time is slightly shorter.


## Functional review and code guide

See [the functional review](docs/FUNCTIONAL_REVIEW.md) for the specification coverage,
corrected bugs, data model, validation evidence and remaining limitations.
Subjects now have a shared library: select them when creating phases. Renaming a
subject changes its name everywhere; phase priorities and hours remain independent.
Backups also offers portable JSON export, and Focus Shelf links can be edited.


## Flexible semester planning

Create a **Weekly preset** with study windows and unavailable university periods,
then build a semester phase from it. Subject hours are goals: a shortfall is shown
without preventing a partial plan from being saved. Each phase keeps its own copy
of the week. See [availability-first planning](docs/AVAILABILITY_PRESETS.md) for the
workflow, changing constraints, and how suggestions adapt to your available time.


**Fill and lock:** recommendations and generated study sessions now use whole or
half hours, favoring 2h+ study stretches with a 90-minute minimum. Use **Fill timetable** after assigning course goals, edit any session
and **Lock** it, then fill the remaining space. Fill avoids putting a course in
separate periods of the same study day and explains unmet goals. Select
**Flexible study time** to reserve time for any subject with its own weekly goal. Preset windows
now contain only the type and times; the optional location/label field is gone.


## macOS launcher

For a complete project download, open **Start Study Orbit.command** in the root
project folder. It also runs from Terminal with `bash "Start Study Orbit.command"`.
See [the beginner-friendly Mac instructions](../../MAC_START_HERE.md).


## Focus workspace and continuous music

The app opens on **Focus**. Use the navigation above it for **Weekly presets**
and **Subjects**. Selecting a phase returns to Focus. The Focus Shelf is available
in every section, including before a phase exists. Playing videos use a floating
player that stays mounted during navigation, phase changes and preset/phase editing.
Minimize it to make room without stopping playback; **Stop** closes it.

New snapshots use the active phase name (or **Workspace** without a phase), the
browser's local date/time and UTC offset, and a short uniqueness suffix. Unsafe
filename characters are replaced and long phase names shortened. JSON exports
also use the phase and local time. These still back up the entire workspace.
Older `State_...` snapshots remain listed and restorable. Backups sort newest first.


## Weekly calendar overview

The active phase's Focus view includes **Your week at a glance**: seven calendar
days with time-proportional, subject-colored sessions, exact times and locked
markers. Overnight sessions split at midnight onto their actual calendar days,
including Sunday/Monday wrap; the dated daily list retains study-day ownership
for goals and completion. Free days stay visible. The calendar scrolls horizontally
on smaller screens, without widening the whole page.

The Windows launcher is `../../Start Study Orbit.cmd`; its service supervisor is
`scripts/start.mjs`. For terminal-only validation, `node scripts/start.mjs --no-open`
starts the same services without opening a browser. The existing Bash/macOS
launchers remain supported. None of the launchers modifies study data during
package repair.


The timetable copies your availability into **unassigned rows** with the same
period boundaries. Choose a subject for each row, shorten a row and add another
session in the freed time, or leave it unassigned to keep that period free.
Only assigned sessions are saved and counted in progress. Reopening a phase keeps
your subject choices and exposes the remaining availability for manual planning.
