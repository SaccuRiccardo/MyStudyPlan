# Study Orbit · MyStudyPlan

A personal study planner that runs in your browser and saves to ordinary JSON files
on your computer. Plan your availability, assign study priorities, build a timetable,
and keep focus music playing while you work. No account or remote database is needed.

## Start on your computer

Download the **complete project** from GitHub (**Code → Download ZIP**) and extract
it before starting. Keep the launcher beside the `study_orbit_react_v7` folder.
You can also clone this repository if you already use Git.

Install the **current Node.js LTS release**, including npm, from
[nodejs.org](https://nodejs.org/en/download). The app requires Node.js **20.19 or
newer**; Node 22 or 24 LTS is recommended. After installation, close and reopen your
terminal so it sees the new PATH.

| System | Start from the extracted project folder | Requirements |
| --- | --- | --- |
| Windows 10/11 | Double-click **Start Study Orbit.cmd** | Node.js + npm; no WSL, Bash or PowerShell setup required |
| macOS | Double-click **Start Study Orbit.command** | Node.js + npm, for Apple Silicon or Intel |
| Linux | Run `bash study_orbit_react_v7/study_orbit_react/run.sh` in a terminal | Node.js + npm + `curl`; `xdg-open` is optional for opening the browser |

The first launch downloads packages and needs internet access. Later launches use
installed packages offline; streaming music/videos still need internet. Install
packages separately on each operating system: **do not copy `node_modules` from
Linux to Windows or macOS**.

The launcher starts the file API on **127.0.0.1:8766** and the frontend on
**127.0.0.1:5173**. Your default browser opens when both are ready. If it does not,
open **http://127.0.0.1:5173/** yourself. Do not double-click `index.html`: the app
needs both local services.

Leave the launcher window open while using the app. Press **Ctrl+C** in that
window to stop it (on Mac, **Control+C**, not Command+C). Closing the browser alone
does not stop the services. Run only one copy at a time. No administrator/root
privileges are needed to launch the application.

### Windows

Double-click **Start Study Orbit.cmd**, including when your project path contains
spaces. If Node/npm is missing or too old, it opens the official Node download
page; install the **Windows Installer (.msi)** with npm selected and try again.

From Command Prompt, you can also run:

```bat
cd /d "C:\Users\YourName\Documents\MyStudyPlan"
"Start Study Orbit.cmd"
```

From PowerShell, run `& '.\Start Study Orbit.cmd'` from the project directory.
There is no need to change PowerShell execution policy. If Windows blocks a
file downloaded from the internet, verify its source and follow your system's
normal security prompts; do not disable antivirus or other security protections.

### macOS

Use **Start Study Orbit.command**, or open Terminal in the project directory and run:

```bash
bash "Start Study Orbit.command"
```

The Terminal command works if ZIP extraction lost the file's executable bit.
Choose the Node installer for your Mac's architecture. See the
[Mac walkthrough](MAC_START_HERE.md) for Finder instructions and native-package repair.

### Linux

Open a terminal in the project directory:

```bash
node --version   # at least 20.19
npm --version
curl --version
bash study_orbit_react_v7/study_orbit_react/run.sh
```

Use your distribution's packages if they supply a supported Node version, or
install current Node LTS using the official download instructions. For example,
Fedora supplies `nodejs`, `npm` and `curl` via `sudo dnf install nodejs npm curl`.
On Ubuntu/Debian, `sudo apt install curl xdg-utils` installs the launcher helpers;
check the Node version separately because older distributions may supply Node 18.
`xdg-utils` provides `xdg-open`; without it, open the local address manually.

## Your plan and backups

Inside `study_orbit_react_v7/study_orbit_react/`:

- `Current_State/` holds your active study data and autosaves.
- `Backups/` holds complete local snapshots. **Save State** names each snapshot
  after the active phase and your local date/time. Existing snapshots still work.
- **Backups → Export JSON** downloads a portable copy. **Import v6/v7 JSON** imports it.

These are personal files, not a cloud sync service. Back up your data before
updating or replacing a project folder. Keep `Current_State/` and `Backups/`, or
export JSON and import it into the new copy. Never delete them to fix a package
installation problem. Share a fresh download of the app rather than your personal
study data.

## Using the planner

Start in **Focus**. Choose **Weekly presets** to set study windows and unavailable
time, then build a phase with subjects, effort priorities and weekly-hour goals.
Autofill favors sessions of **2 hours or longer**, with a **90-minute minimum** for
new study stretches. Lock sessions you want to preserve. **Flexible study time**
reserves time without assigning a course.

An active phase shows a **weekly calendar overview**, followed by the dated daily
schedule for goals and completion. Subject colors, session times, free days and
overnight continuations make the whole week visible. On a narrow screen, scroll
inside the calendar horizontally. The Focus Shelf and floating player remain
available as you navigate and edit.

## Troubleshooting

- **Port in use:** stop your other Study Orbit launcher with Ctrl+C and retry.
  The launcher does not stop unrelated applications.
- **Package download failed:** check internet access to the npm registry and retry.
  Keep the actual error message if you need help.
- **Page cannot load / API error:** start the launcher and keep its terminal open;
  confirm both services started before opening the browser.
- **Different computer or operating system:** transfer JSON data, not `node_modules`.
- **Embedded video will not play:** some videos disallow embedding or need a click.
  Use **Open on YouTube / website** when necessary.

## Development and details

See the [application README](study_orbit_react_v7/study_orbit_react/README.md) for
architecture, tests, API routes and migration from older versions. Run developer
commands from `study_orbit_react_v7/study_orbit_react`, where `package.json` lives.


## Fresh public downloads

A new installation starts with empty subjects, phases, presets, notes, progress,
and media favorites. Personal timetables and playlist links are not bundled.
Local state, backups, timestamped exports, ZIP archives and environment files are
ignored by Git. Git archives also omit state/backup directories. These protections
do not remove files that someone deliberately force-adds, nor erase old commits.

Keep your existing local data when updating. Full v6/v7 JSON imports remain supported;
older v5 exports without a timetable require a full export from the old installation.


## Weekly completion

In **Focus**, mark a dated study block complete using its check button. **Weekly
allocation** fills the subject's progress bar and the color-coded weekly summary;
unmarking the block reverses that progress. Effort priorities and weekly-hour goals
stay visible. Completion follows the week selected in the daily schedule and counts
scheduled hours, not measured study time or effort-weighted points. A fully completed
partial timetable still shows any goal hours that have not been scheduled.


## Manual or suggested planning

Continue through the phase builder to enter your own weekly-hour goals and add
sessions manually. Suggestions never run automatically: use **Suggest hours by
priority** or **Fill timetable** when you want help. Fill replaces unlocked
sessions; lock manual choices first if you want to keep them. Availability rows
sort after you leave a completed row, and new periods start at the previous end.
