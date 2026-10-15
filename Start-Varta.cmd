@echo off
cd /d "%~dp0"
set "VARTA_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "VARTA_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%VARTA_NODE%" --version >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte Node.js ab Version 22.9 installieren.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:8787"
"%VARTA_NODE%" server.mjs
pause
