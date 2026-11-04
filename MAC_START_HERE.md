# Open Study Orbit on a Mac

## First time

1. Download the complete project from GitHub (**Code → Download ZIP**).
2. Double-click the ZIP to extract it. Move the extracted folder somewhere you
   want to keep it, such as Documents. Do not run it from inside an archive.
3. In that folder, double-click **Start Study Orbit.command**. Terminal opens.
4. If Node.js is missing, the launcher opens its official download page. Choose
   the **LTS macOS Installer (.pkg)**, install it, close Terminal, and double-click
   the launcher again. Use the installer for your Mac (Apple Silicon or Intel).
5. Wait for the first download to finish. Study Orbit opens automatically in your
   **default browser**, whichever browser you use.

You do not need Homebrew, Git, Python, or programming knowledge. Internet access
is needed for the first package installation. Your study data stays in this copy
of the project.

## Every time after that

Double-click **Start Study Orbit.command**. Leave its Terminal window open while
studying. To stop, click that window and press **Control+C** (the Control key, not
Command). Closing the browser tab alone does not stop the app.

## Start directly from Terminal

Type `cd ` (with a space), drag the extracted project folder from Finder into
Terminal, then press Return. Next paste:

```bash
bash "Start Study Orbit.command"
```

This also works if the downloaded launcher has lost its executable permission.
The folder can have spaces in its name.

## If something does not open

- If macOS blocks the downloaded script, use the Terminal command above after
  checking that you downloaded this project from its trusted GitHub repository.
  Follow your Mac's normal security prompts; no security settings need disabling.
- If the browser does not open, enter `http://127.0.0.1:5173` in it once Terminal
  says Study Orbit is running.
- If it says a port is already in use, stop the other Study Orbit Terminal window
  with Control+C, then try again. The launcher will not stop unrelated apps.
- If installation fails, check your internet connection and retry. Keep the error
  message if you need help. Do not delete Current_State or Backups to fix startup.

The state and backups live under
`study_orbit_react_v7/study_orbit_react/Current_State` and `Backups`. Keep a copy
of these folders when replacing or updating the downloaded project. When sharing
the project, share a fresh download rather than your personal state folder or
Linux node_modules directory: Mac packages are installed on the first launch.

## Missing Rollup or esbuild Mac package

The updated launcher checks that packages actually load, including the Mac native
binaries. It repairs missing Apple Silicon or Intel optional packages using the
versions matching the installed Rollup/esbuild tools. Internet access is needed
for this repair. It preserves package.json, existing lockfiles, Current_State,
and Backups. You do not need to delete your study data or reinstall Node.js for
this particular error.

This also handles npm installations whose lockfile omitted a platform-specific
optional package. The checks and repair finish before either app server starts.
