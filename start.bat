@echo off
rem Starts the Mosaic server and opens the wall in your default browser.
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
start "" http://localhost:3000/
rem Press F11 in the browser for full screen. The admin page is at http://localhost:3000/admin/ (or run admin.bat).
rem The iPad addresses and the admin PIN are printed in the server window.
