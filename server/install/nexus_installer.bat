@echo off
setlocal enabledelayedexpansion
title Project Nexus - Instalator Windows
cd /d "%~dp0\..\.."

set "SILENT_MODE=0"
if /i "%~1"=="/silent" set "SILENT_MODE=1"
if /i "%~1"=="-silent" set "SILENT_MODE=1"
if /i "%~1"=="/s" set "SILENT_MODE=1"

:: 1. Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if "%SILENT_MODE%"=="0" (
        echo [!] Node.js nie zostal wykryty w zmiennej PATH.
        echo Zainstaluj Node.js ze strony: https://nodejs.org/
        pause
    )
    exit /b 1
)

:: 2. Ensure dependencies if missing
if not exist "node_modules\express" (
    call npm install --omit=dev --no-audit --no-fund >nul 2>&1
)

:: 3. Register Context Menu in Windows Explorer (pointing to native nexus-launcher.exe)
set "APP_DIR=%CD%"
set "LAUNCHER_PATH=%APP_DIR%\nexus-launcher.exe"

powershell -NoProfile -Command "try { $cmd = '\"%APP_DIR%\nexus-launcher.exe\" \"%%1\"'; New-Item -Path 'HKCU:\Software\Classes\Directory\shell\ProjectNexus' -Value 'Otworz w Project Nexus' -Force | Out-Null; New-Item -Path 'HKCU:\Software\Classes\Directory\shell\ProjectNexus\command' -Value $cmd -Force | Out-Null; if (Test-Path '%APP_DIR%\icon.ico') { Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\ProjectNexus' -Name 'Icon' -Value '%APP_DIR%\icon.ico' -Force | Out-Null; } } catch {}" >nul 2>&1

exit /b 0
