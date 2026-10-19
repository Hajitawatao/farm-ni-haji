@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
set BRANCH=main

where git >nul 2>nul
if errorlevel 1 (
  echo Git for Windows is not installed. Get it from https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist ".git" git init -b %BRANCH%

for /f "delims=" %%e in ('git config user.email 2^>nul') do set CUR_EMAIL=%%e
if not defined CUR_EMAIL (
  git config user.email "meliodas2327@gmail.com"
  git config user.name "meliodas2327"
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  set /p REPO_URL=Paste the GitHub repo URL:
  call git remote add origin "%%REPO_URL%%"
)

git ls-remote --exit-code --heads origin %BRANCH% >nul 2>nul
set LSR=!errorlevel!
if "!LSR!"=="0" goto remote_ok
if "!LSR!"=="2" goto remote_missing
echo Cannot reach the GitHub repo. Check the internet connection and your GitHub sign-in.
pause
exit /b 1

:remote_ok
git rev-parse --verify HEAD >nul 2>nul
if errorlevel 1 (
  git fetch origin %BRANCH%
  git reset --mixed FETCH_HEAD
  git branch -u origin/%BRANCH%
)
git pull --rebase --autostash origin %BRANCH%

:remote_missing
git add -A
git diff --cached --quiet
if not errorlevel 1 (
  for /f %%c in ('git rev-list --count origin/%BRANCH%..HEAD 2^>nul') do set AHEAD=%%c
  if defined AHEAD if not "!AHEAD!"=="0" (
    git push -u origin %BRANCH%
    pause
    exit /b 0
  )
  echo Nothing new to save.
  pause
  exit /b 0
)

for /f "delims=" %%d in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set NOW=%%d
set MSG=
set /p MSG=Describe your change (Enter = "Update !NOW!"):
if not defined MSG set MSG=Update !NOW!
git commit -m "!MSG!"
git push -u origin %BRANCH%
pause
