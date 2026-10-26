@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js 18 or newer is required to run the automatic election feeds and geographic map.
  echo Download Node.js from https://nodejs.org/ and then run this file again.
  echo.
  pause
  exit /b 1
)
echo Starting 2026 Midterms Command Center...
node local-server.js
if errorlevel 1 pause
