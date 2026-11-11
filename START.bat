@echo off
title Wissens-City LIVE
cd /d "%~dp0"
where node >NUL 2>NUL
if errorlevel 1 (
  echo Node.js fehlt! Bitte zuerst von https://nodejs.org die LTS-Version installieren.
  pause
  exit /b
)
if not exist node_modules (
  echo Installiere benoetigte Pakete ^(nur beim ersten Start^) ...
  call npm install
)
rem Microsoft Edge hat die schoensten deutschen Stimmen (Seraphina, Florian, Katja, Conrad)
start "" msedge "http://localhost:8080" 2>NUL || start "" "http://localhost:8080"
node server.js
pause
