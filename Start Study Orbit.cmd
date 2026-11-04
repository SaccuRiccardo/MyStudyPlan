@echo off
setlocal
cd /d "%~dp0"
echo Welcome to Study Orbit!
where node >nul 2>&1
if errorlevel 1 goto missing_node
where npm >nul 2>&1
if errorlevel 1 goto missing_node
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=19)?0:1)"
if errorlevel 1 goto missing_node
if not exist "study_orbit_react_v7\study_orbit_react\scripts\start.mjs" (
  echo Project files are missing. Extract the complete project ZIP first.
  pause
  exit /b 1
)
node "study_orbit_react_v7\study_orbit_react\scripts\start.mjs"
set "result=%errorlevel%"
if not "%result%"=="0" pause
exit /b %result%
:missing_node
echo Install the current Node.js LTS Windows Installer from https://nodejs.org/en/download
echo Keep npm selected in the installer. Close this window after installing and start again.
start "" "https://nodejs.org/en/download"
pause
exit /b 1
