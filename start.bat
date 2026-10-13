@echo off
rem Starts the Mosaic server and opens the wall full-screen on this PC.
rem Uses the bundled runtime\node.exe, so Node.js does not need to be installed.
cd /d "%~dp0"
set "NODE=node"
if exist "runtime\node.exe" set "NODE=runtime\node.exe"
%NODE% --version >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Keep the "runtime" folder next to this file, or install Node.js from https://nodejs.org
  pause
  exit /b 1
)

rem Refresh the https certificate for this PC's current IP address (the iPad keeps trusting the same authority).
%NODE% tools\make-cert.js

start "Mosaic server (keep this window open)" cmd /k %NODE% server.js
timeout /t 3 >nul
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --kiosk --autoplay-policy=no-user-gesture-required http://localhost:3000/
) else (
  start "" msedge --kiosk http://localhost:3000/ --edge-kiosk-type=fullscreen
)
rem Exit the full-screen wall with Alt+F4. The iPad addresses are printed in the server window.
