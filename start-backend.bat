@echo off
title Nexus Founder OS - Backend & Cloudflare Launcher
echo ===================================================
echo   Nexus Founder OS - Local Backend & Cloudflare Tunnel
echo   Domain: dashboardkiller.online
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
echo [3/3] Starting Cloudflare Tunnel to dashboardkiller.online...
cloudflared.exe tunnel run --token eyJhIjoiNjgyYTI2OGM1YjBlNThhMjRjMTU0Y2I2MjU1ODVlN2MiLCJ0IjoiZDg4NTUzZmItZDVlMy00OTZhLWIyNWUtOGY4ODI1NTcwYTIzIiwicyI6Ik56UXlPV0pqTnpJdE5HSmtNQzAwWW1GbExUbGtPREV0WVRObFpqZGxZVEpqTjJabSJ9

pause
