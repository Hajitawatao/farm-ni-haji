@echo off
title Farm Ni Haji Monitor
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
:loop
node server.js
echo.
echo The monitor stopped. Restarting in 5 seconds. Close this window to quit.
timeout /t 5 >nul
goto loop
