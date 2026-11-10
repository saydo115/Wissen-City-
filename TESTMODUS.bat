@echo off
title Wissens-City TESTMODUS
cd /d "%~dp0"
where node >NUL 2>NUL
if errorlevel 1 (
  echo Node.js fehlt! Bitte zuerst von https://nodejs.org die LTS-Version installieren.
  pause
  exit /b
)
if not exist node_modules call npm install
start "" "http://localhost:8080/?demo=1"
node server.js --demo
pause
