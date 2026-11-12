@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Conectar la laptop con el VPS
echo.
echo   Conecta esta laptop con el VPS (una sola vez).
echo   Despues, al abrir la fabrica, se conecta sola: las investigaciones llegan aqui
echo   y el VPS puede pedirle Flow a esta laptop.
echo.
set /p VPS=  Usuario@IP del VPS (Enter = root@109.123.247.83): 
if "%VPS%"=="" set VPS=root@109.123.247.83
node fabrica.js conectar-vps %VPS%
pause
