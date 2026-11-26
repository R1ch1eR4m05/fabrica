@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Anuncios UGC de Levania
echo.
echo Revisando escenas...
node fabrica.js ugc-escenas
echo.
set /p N=Cuantos anuncios quieres? (Enter = 5): 
if "%N%"=="" set N=5
node fabrica.js ugc-lote %N%
echo.
node fabrica.js ugc-estado
if not exist "%~dp0listos\anuncios-ugc" mkdir "%~dp0listos\anuncios-ugc"
start "" "%~dp0listos\anuncios-ugc"
pause
