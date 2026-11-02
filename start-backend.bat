@echo off
title Nexus Founder OS - Backend & Tunnel Launcher
echo ===================================================
echo   Nexus Founder OS - Local Backend & Ngrok Tunnel
echo   Static Domain: inlying-untranscended-dorothy.ngrok-free.dev
echo ===================================================
echo.

echo [1/3] Checking MongoDB...
tasklist /FI "IMAGENAME eq mongod.exe" 2>NUL | find /I /N "mongod.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo MongoDB is already running.
) else (
    echo Starting MongoDB daemon...
    start "MongoDB" /min "C:\Program Files\MongoDB\Server\9.0\bin\mongod.exe" --dbpath "d:\FOR RENDO (ONLY )\Personal Project\CRM\backend\data" --bind_ip 127.0.0.1 --port 27017
    timeout /t 2 >nul
)

echo.
echo [2/3] Checking FastAPI Server...
tasklist /FI "WINDOWTITLE eq Nexus FastAPI*" 2>NUL | find /I /N "cmd.exe">NUL
start "Nexus FastAPI" /min "C:\Users\ROS RENDO\AppData\Local\Programs\Python\Python314\python.exe" -m uvicorn server:app --app-dir backend --host 127.0.0.1 --port 8000

timeout /t 2 >nul

echo.
echo [3/3] Starting ngrok tunnel to inlying-untranscended-dorothy.ngrok-free.dev...
npx ngrok http --url=inlying-untranscended-dorothy.ngrok-free.dev 8000

pause
