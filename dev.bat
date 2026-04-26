@echo off
setlocal

REM Locate project directory (the folder this .bat sits in, even via shortcut).
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo ========================================
echo  Woong World - Local Dev Server
echo  %PROJECT_DIR%
echo ========================================
echo.

REM Check Node is installed.
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo Install from https://nodejs.org/  (LTS recommended)
  pause
  exit /b 1
)

REM Install deps on first run.
if not exist node_modules (
  echo [setup] node_modules not found. Running npm install...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

REM Open browser after a short delay so the dev server has time to start.
start "" /b cmd /c "timeout /t 4 >nul & start http://localhost:3000"

REM Run the dev server (Next.js).
call npm run dev

REM If the server stops, keep the window open so user can read errors.
echo.
echo [exited] Press any key to close this window.
pause >nul
