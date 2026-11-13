@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Fabrica de videos (no cierres esta ventana)
rem Si la fabrica ya estaba abierta (version vieja), la cierra para abrir la nueva
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'fabrica\.js' -and $_.CommandLine -notmatch 'conectar-vps' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:"127.0.0.1:4870 .*LISTENING"') do taskkill /PID %%a /F >nul 2>nul
node fabrica.js panel
pause
