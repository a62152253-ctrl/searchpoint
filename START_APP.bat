@echo off
setlocal enabledelayedexpansion
title PROJECT NEXUS - Local Autonomous File Intelligence
cd /d "%~dp0"

if exist "nexus-launcher.exe" (
    start "" "%~dp0nexus-launcher.exe" %*
    exit /b 0
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [BLAD] Node.js nie zostal znaleziony w sciezce PATH!
    echo Pobierz i zainstaluj Node.js ze strony: https://nodejs.org/
    pause
    exit /b 1
)

powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -WindowStyle Hidden -FilePath 'node.exe' -ArgumentList 'server\server.cjs'"
timeout /t 1 /nobreak >nul
start http://localhost:3001
exit /b 0
