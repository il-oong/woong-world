@echo off
setlocal

REM ===========================================================
REM   Woong World - Desktop launcher
REM
REM   Copy this file to your Desktop, then edit the line below
REM   so PROJECT_DIR points to your local clone of woong-world.
REM ===========================================================

set "PROJECT_DIR=C:\Users\%USERNAME%\woong-world"

REM ---- nothing below should need editing ----

if not exist "%PROJECT_DIR%\package.json" (
  echo [ERROR] PROJECT_DIR is not a valid woong-world folder:
  echo   %PROJECT_DIR%
  echo.
  echo Open this .bat in Notepad and fix the PROJECT_DIR line at the top.
  pause
  exit /b 1
)

cd /d "%PROJECT_DIR%"

echo ========================================
echo  Woong World - Local Dev Server
echo  %PROJECT_DIR%
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo Install from https://nodejs.org/  (LTS recommended)
  pause
  exit /b 1
)

if not exist node_modules (
  echo [setup] node_modules not found. Running npm install...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

start "" /b cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm run dev

echo.
echo [exited] Press any key to close this window.
pause >nul
