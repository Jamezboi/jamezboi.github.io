@echo off
setlocal EnableExtensions
title Sentinel Setup
set "SENTINEL_HOME=%LOCALAPPDATA%\Sentinel"
set "SENTINEL_LOG=%SENTINEL_HOME%\setup.log"
set "SENTINEL_ZIP=%TEMP%\Sentinel-Desktop.zip"
set "SENTINEL_URL=https://jamezboi.github.io/sentinel/download/Sentinel-Desktop.zip"
echo Sentinel Setup for Windows
echo This installs Sentinel only for the current Windows user.
if not exist "%SENTINEL_HOME%" mkdir "%SENTINEL_HOME%"
echo [%date% %time%] Setup started > "%SENTINEL_LOG%"
echo [1/4] Downloading Sentinel...
curl.exe --fail --location --silent --show-error "%SENTINEL_URL%" --output "%SENTINEL_ZIP%" >> "%SENTINEL_LOG%" 2>&1
if errorlevel 1 curl.exe --fail --location --silent --show-error "https://jamezboi.github.io/download/Sentinel-Desktop.zip" --output "%SENTINEL_ZIP%" >> "%SENTINEL_LOG%" 2>&1
if errorlevel 1 goto :failed
echo [2/4] Updating local files...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%SENTINEL_ZIP%' -DestinationPath '%SENTINEL_HOME%' -Force" >> "%SENTINEL_LOG%" 2>&1
if errorlevel 1 goto :failed
echo [3/4] Creating an isolated Python environment...
where py >nul 2>&1 && (py -3 -m venv "%SENTINEL_HOME%\.venv") || (python -m venv "%SENTINEL_HOME%\.venv")
if errorlevel 1 goto :failed
echo [4/4] Installing Sentinel requirements (this can take a few minutes)...
"%SENTINEL_HOME%\.venv\Scripts\python.exe" -m pip install --upgrade pip >> "%SENTINEL_LOG%" 2>&1
"%SENTINEL_HOME%\.venv\Scripts\python.exe" -m pip install -r "%SENTINEL_HOME%\requirements.txt" >> "%SENTINEL_LOG%" 2>&1
if errorlevel 1 goto :failed
start "Sentinel" /D "%SENTINEL_HOME%" "%SENTINEL_HOME%\.venv\Scripts\python.exe" main.py
echo Sentinel is ready. You can close this setup window.
exit /b 0
:failed
echo Setup failed. Review %SENTINEL_LOG% and try again.
pause
exit /b 1
