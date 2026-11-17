@echo off
title SimpliTex ERP - LAN Server
cd /d "%~dp0"

set "NODE_BIN="
if exist "%~dp0node.exe" (
    set "NODE_BIN=%~dp0node.exe"
) else (
    where node >nul 2>&1
    if not errorlevel 1 set "NODE_BIN=node"
)

if "%NODE_BIN%"=="" (
    echo.
    echo ====================================================
    echo   ERROR: Node.js is NOT installed on this PC!
    echo ====================================================
    echo   1. Sirf Main PC par Node.js LTS install karein:
    echo      https://nodejs.org
    echo   2. Ya portable "node.exe" isi folder me rakhein.
    echo ====================================================
    echo.
    pause
    exit /b 1
)

echo.
echo ====================================================
echo   Starting SimpliTex ERP - Offline LAN Server...
echo ====================================================
echo   [Tip] Agar Windows Firewall popup aaye, toh
echo         Private & Public dono tick karke "Allow" karein.
echo ====================================================
echo.

REM 2 second baad Main PC par browser apne aap khol dega
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

"%NODE_BIN%" "%~dp0server.js"

echo.
echo Server band ho gaya hai.
pause
