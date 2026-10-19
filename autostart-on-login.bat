@echo off
rem Makes the monitor start automatically when this Windows user logs in.
cd /d "%~dp0"
set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Farm Ni Haji Monitor.bat"
> "%TARGET%" echo @echo off
>> "%TARGET%" echo start "Farm Ni Haji Monitor" /min cmd /c ""%~dp0start-monitor.bat""
echo Done. The monitor will start minimized every time you log in.
echo To undo, delete: %TARGET%
pause
