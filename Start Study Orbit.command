#!/bin/bash
# Double-click in Finder, or run: bash "Start Study Orbit.command"
# Use only features supported by the Bash 3.2 supplied with macOS.
set -eu
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Keep helpful failures visible when Terminal was opened by double-clicking.
finish() {
  result=$?
  trap - EXIT
  if [[ $result != 0 && $result != 130 && $result != 143 && -t 0 ]]; then
    printf '\nPress Return to close this window.'
    read -r answer || true
  fi
  exit "$result"
}
trap finish EXIT

printf '\nWelcome to Study Orbit!\n\n'
if [[ $(uname -s) != Darwin ]]; then
  echo 'This launcher is for macOS. On Linux, use the app folder’s run.sh.' >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 ||
   ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number); process.exit(major>20||(major===20&&minor>=19)?0:1)' >/dev/null 2>&1; then
  printf '%s\n' \
    'One-time setup: install Node.js so Study Orbit can run.' \
    '' \
    '1. On the page opening now, choose the current LTS version' \
    '   and download the macOS Installer (.pkg).' \
    '2. Open that installer and follow its instructions.' \
    '3. Close this Terminal window, then double-click' \
    '   Start Study Orbit.command again.' \
    '' \
    'No Homebrew or programming tools are needed.' \
    'Download page: https://nodejs.org/en/download'
  open 'https://nodejs.org/en/download' || true
  exit 1
fi

app_dir="$PWD/study_orbit_react_v7/study_orbit_react"
if [[ ! -f "$app_dir/run.sh" || ! -f "$app_dir/package.json" ]]; then
  echo 'Part of the project is missing. Download and extract the complete project again.' >&2
  echo 'Keep this launcher beside the study_orbit_react_v7 folder.' >&2
  exit 1
fi

printf '%s\n' \
  'Starting your planner. The first launch installs its packages' \
  'and needs an internet connection; please wait.' \
  '' \
  'Your default browser will open when the planner is ready.' \
  'Leave this Terminal window open while you use Study Orbit.' \
  'To stop the app, return here and press Control+C.' \
  ''

if bash "$app_dir/run.sh"; then
  exit 0
else
  result=$?
  if [[ $result != 130 && $result != 143 ]]; then
    printf '\nStudy Orbit could not keep running.\n'
    printf 'If another Study Orbit window is open, stop it with Control+C first.\n'
    printf 'For a failed first-time package download, check your internet connection and try again.\n'
    printf 'The details above explain what went wrong. Your saved study files are kept.\n'
  fi
  exit "$result"
fi
