@echo off
rem Run this ONCE as Administrator (right-click, Run as administrator)
rem so other PCs on the LAN can open the farm page.
cd /d "%~dp0"
set PORT=8080
for /f "tokens=2 delims=:, " %%a in ('findstr /c:"\"port\"" config.json') do set PORT=%%a
netsh advfirewall firewall delete rule name="Farm Ni Haji Monitor" >nul 2>nul
netsh advfirewall firewall add rule name="Farm Ni Haji Monitor" dir=in action=allow protocol=TCP localport=%PORT% profile=any
if errorlevel 1 (
  echo Failed. Right-click this file and choose "Run as administrator".
) else (
  echo Port %PORT% is open for the LAN.
)
pause
