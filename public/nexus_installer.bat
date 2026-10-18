@echo off
setlocal enabledelayedexpansion
title Project Nexus - Instalator Systemowy Windows
color 0b

echo ===================================================================
echo             PROJECT NEXUS - INSTALATOR SYSTEMOWY WINDOWS
echo       Inteligentny Eksplorator Plikow i Prywatne Lokalne AI
echo ===================================================================
echo.

:: 1. Check Node.js runtime
echo [*] Sprawdzanie srodowiska wykonawczego Node.js...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] Node.js nie zostal wykryty w zmiennej PATH.
    echo [*] Otwieram oficjalny instalator Node.js LTS...
    start https://nodejs.org/
    echo.
    echo Zainstaluj Node.js LTS, a nastepnie uruchom ten instalator ponownie.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
echo [*] Wykryto Node.js: %NODE_VER% (Zgodne)
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\ProjectNexus"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: 2. Resolve or download application package
set "ZIP_FILE=%~dp0mainappsearchpoint.zip"
if not exist "%ZIP_FILE%" (
    if exist "%USERPROFILE%\Desktop\mainappsearchpoint.zip" (
        set "ZIP_FILE=%USERPROFILE%\Desktop\mainappsearchpoint.zip"
    ) else if exist "%USERPROFILE%\Downloads\mainappsearchpoint.zip" (
        set "ZIP_FILE=%USERPROFILE%\Downloads\mainappsearchpoint.zip"
    ) else (
        set "ZIP_FILE=%TEMP%\mainappsearchpoint.zip"
        echo [*] Pobieranie pakietu aplikacji z serwera searchpoint.pl...
        powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://searchpoint.pl/mainappsearchpoint.zip', '%TEMP%\mainappsearchpoint.zip')"
    )
)

if exist "%ZIP_FILE%" (
    echo [*] Wypakowywanie silnika do %INSTALL_DIR%...
    powershell -NoProfile -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%INSTALL_DIR%' -Force"
)

:: 3. Execute installation engine
set "INSTALL_SCRIPT=%INSTALL_DIR%\server\install\install_core.cjs"
if not exist "%INSTALL_SCRIPT%" (
    if exist "%~dp0install_core.cjs" set "INSTALL_SCRIPT=%~dp0install_core.cjs"
    if exist "%USERPROFILE%\Downloads\dsa\server\install\install_core.cjs" set "INSTALL_SCRIPT=%USERPROFILE%\Downloads\dsa\server\install\install_core.cjs"
)

if exist "%INSTALL_SCRIPT%" (
    echo [*] Konfigurowanie srodowiska i skrotow...
    node "%INSTALL_SCRIPT%"
)

:: 4. Register Context Menu in Windows Explorer
echo [*] Rejestracja w menu kontekstowym folderow Windows...
powershell -NoProfile -Command "try { New-Item -Path 'HKCU:\Software\Classes\Directory\shell\ProjectNexus' -Value 'Otworz w Project Nexus' -Force | Out-Null; New-Item -Path 'HKCU:\Software\Classes\Directory\shell\ProjectNexus\command' -Value ('wscript.exe \"' + $env:LOCALAPPDATA + '\ProjectNexus\launch_silent.vbs\" \"%1\"') -Force | Out-Null; } catch {}" >nul 2>&1

:: 5. Create Uninstaller script
(
    echo @echo off
    echo echo Usuwanie Project Nexus...
    echo del /f /q "%USERPROFILE%\Desktop\Project Nexus.lnk" 2>nul
    echo del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Project Nexus.lnk" 2>nul
    echo powershell -NoProfile -Command "Remove-Item -Path 'HKCU:\Software\Classes\Directory\shell\ProjectNexus' -Recurse -ErrorAction SilentlyContinue" 2>nul
    echo echo Odinstalowano pomyslnie.
    echo pause
) > "%INSTALL_DIR%\uninstall.bat"

echo.
echo ===================================================================
echo           SUKCES! APLIKACJA ZOSTALA ZAINSTALOWANA!
echo ===================================================================
echo  [+] Skrot powstal na Pulpicie: Project Nexus.lnk
echo  [+] Dodano do Menu Start oraz menu pod prawym przyciskiem myszy
echo  [+] Uruchamianie aplikacji w czystym oknie pulpitu bez okna CMD...
echo ===================================================================
echo.

:: 6. Launch immediately in app mode
if exist "%INSTALL_DIR%\launch_silent.vbs" (
    start "" wscript.exe "%INSTALL_DIR%\launch_silent.vbs"
) else if exist "%INSTALL_DIR%\START_APP.bat" (
    start "" "%INSTALL_DIR%\START_APP.bat"
)

timeout /t 3 >nul
exit /b 0
