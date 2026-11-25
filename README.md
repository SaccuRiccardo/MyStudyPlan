# Study Orbit · MyStudyPlan

A personal study planner that runs in your browser and saves to ordinary JSON files
on your computer. Plan your availability, assign study priorities, build a timetable,
and keep focus music playing while you work. No account or remote database is needed.

## Who made this very serious piece of software?

Everything here was done by **ChatGPT**. I’m just a student who didn’t want to pay
crazy subscription plans for stupid applications that everyone could apparently
vibe code. So, naturally, I asked ChatGPT to vibe code one more application.

And no, I’m not paying for ChatGPT either: this is a **free one-month trial**.
I refused to pay for a productivity app and then used a free trial to build one.
The budget is zero. The requests are apparently unlimited.

My contribution: “can you also add this?” Approximately 400 times.
ChatGPT’s contribution: everything else.

**Yes, this text is also vibe coded.** I outsourced the disclaimer about outsourcing.
We believe in consistency around here.

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

Open **Pomodoro** beside **Focus** to study in timed intervals. Start with
25-minute focus periods, 5-minute short breaks and 15-minute long breaks, or
choose your own durations and how many focus intervals precede a long break.
Automatic starts for breaks and the next focus interval are optional. Choose
white, brown or pink noise, synthesized rain, or **Quiet**, then adjust the
background volume. The soundtrack follows the timer; you can keep it during
breaks or use **Preview sound** while paused. Interval-end alerts use the sound
and alert volume from **Settings**.

The timer keeps running as you move between pages and survives a reload in the
same browser tab. After reloading, click to enable audio again. Timer preferences
are saved with your local plan and backups. Pomodoros also work outside a scheduled
session and do not automatically mark timetable sessions complete.

Click a calendar session or a subject's **Study diary** to record what you studied,
its completion status, and your next steps. **Save study log** keeps each saved
version, so earlier notes stay available under **Saved history**. Filter the diary
by any date range and phase for weekly recall or a semester review. You can also
add an independent diary entry for study outside the timetable.

Next steps can be changed at any time, including after the ten-minute handoff;
the latest edited next step appears in the subject's next session. The calendar
always displays **07:00–22:00** and lets you browse earlier and later weeks.
**Settings** provides separate beginning/end sound switches and test buttons.
Keep the app open and your device awake for sounds; browser audio restrictions
may require clicking a test button after reopening it.

## Read slides with the timer

Open **Slides**, choose a subject, and save the **absolute folder path** containing
its PDFs. Use the path on the computer running Study Orbit, for example
`C:\Users\You\Documents\Physics slides` on Windows or
`/Users/you/Documents/Physics slides` on macOS. The app lists PDFs in the folder
and its subfolders. Select a PDF to read it in the page while the shared Pomodoro
timer remains visible. **Refresh** finds newly added or renamed files.

Your slides stay in their original folder; they are not uploaded or copied into
Study Orbit. Local state, JSON exports and backups remember the folder path, not
the PDF files. If you move the folder or use another computer, save its new path.
Keep your own backup of the slide files. **Open PDF in new tab** provides browser
printing, downloads and a fallback for protected documents.

The built-in white, brown, pink and rain-like background sounds are generated
procedurally on your device. The app does not bundle music recordings or sampled
tracks for these sounds. Focus Shelf links and any custom audio you upload are
content you choose from external sources; their own permissions still apply.

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


## Your timetable takes precedence

Availability periods stay synchronized with the manual timetable as you edit or
choose a preset. **Split** divides a period without assigning the new part to a
subject. **Add time slot** can divide a remaining blank period, use free study
availability, or append extra editable time when the initial periods are full.

Weekly-hour goals are advisory. The app saves your assigned timetable exactly as
entered, even when it differs by several hours, includes separate same-course
sessions, or adds study time outside the original study windows. Review explains
these differences without blocking Save. Shorter or minute-level manual sessions
are also allowed; the 90-minute minimum and half-hour increments apply to autofill.

Actual overlaps, invalid times and conflicts with explicitly unavailable time must
be fixed. Errors identify the day, times and subject, then explain whether to move,
shorten, unlock or split a session, adjust the blocked period, or select +1 day.

## Tools Library

Open **Tools Library** in the left sidebar and select **Add Tool**. Paste a web
address to fetch its title and preview, then customize its name and optional
category. Sites that block previews can still be saved with a name and a clean
site icon. Click a card to open it in a new tab; use search, category filters,
and the arrow/edit/delete controls to arrange your shelf. Saved tools and their
order are included in local state, backups, and JSON exports. Preview fetching
requires internet access; saved links remain available offline.

For sites without an automatic preview, edit the tool and paste a **Preview image
URL** or **Upload preview image** (PNG/JPG/WebP, up to 1 MB). Uploaded covers are
saved locally. **Retry website lookup** checks the site again without replacing
your manually chosen cover.

The slides reader saves a bookmark for each PDF: page, zoom and the exact position
within the page. Switching app sections, changing PDFs and reloading the page
restore that position. The last selected PDF is remembered per subject/folder.
Bookmarks stay in this browser profile (localStorage); they are separate from
JSON study-state backups and do not alter your PDF files. Page/zoom controls,
selectable text and **Find** are built into the reader. Use **Open PDF in new tab**
for browser printing, downloads, or password-protected PDFs.

After updating, restart the normal launcher so it installs the PDF reader package.
PDF rendering uses Mozilla PDF.js (Apache-2.0); its license is included in
`public/licenses/pdfjs.txt`. The project’s MIT license remains unchanged.

Use the PDF toolbar’s **− / +** buttons for manual zoom, or enter a percentage
and press **Enter** or **Apply** (10%–1000%). Pinch or use **Ctrl/Cmd + wheel**
over the PDF to zoom around the pointer. With the PDF focused, **Ctrl/Cmd + +**,
**−**, and **0** zoom in, zoom out, and return to 100%. Normal scrolling still
scrolls the document, and your chosen zoom is included in its reading bookmark.

The slides file list groups PDFs by subfolder, including nested folders. Click a
folder's arrow to collapse or expand its PDFs; search by filename or folder name
to see matching files in their folder structure. **Hide files / Show files** in
the reader toolbar gives the PDF more room, including in fullscreen. The sidebar
choice is remembered in this browser, and toggling it keeps your current PDF,
page and manual zoom. **Fit width** adapts to the available space.

You can also collapse the PDF file list from its own header and reopen it with
**Show files** in the top toolbar. Drag the divider at the file list’s right
edge to adjust its width; the browser remembers your preference. Focus the
divider and use Left/Right arrows for keyboard resizing (Home/End for limits),
or double-click it to reset. On narrow screens, use the collapse/show controls.

Use **Right / Left arrows** to move to the next / previous page while the slides
view is active. **Up / Down arrows** scroll the PDF in small 40-pixel steps,
without scrolling the surrounding app. Text fields, sidebar controls and modified
shortcuts keep their normal keyboard behavior. **Ctrl/Cmd+F** focuses the reader’s
search across the whole PDF, including pages that are not currently on screen.
The search shows a match count; use **Enter / Shift+Enter** or its next/previous
buttons to move between results. Search also opens directly in compact and
fullscreen views. Fullscreen and full-width reading (with the file list
hidden) use one compact top bar for the filename, sidebar, timer and settings.
Open **PDF controls** (the page count and sliders icon) for page, zoom and search
controls. The separate filename bar and instructional footer have been removed.

The **Skip focus / Skip break** button beside the slides timer advances to the
next interval without leaving the PDF. It also works before starting an interval,
so you can skip a break you already took. The next interval is paused and ready
to start; skipped focus time does not count as a completed Pomodoro. In compact
and fullscreen views, look for the skip-forward icon beside the countdown.
