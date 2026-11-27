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
set ERR=%errorlevel%
echo.
node fabrica.js ugc-estado
if "%ERR%"=="0" (
  if not exist "%~dp0listos\anuncios-ugc" mkdir "%~dp0listos\anuncios-ugc"
  start "" "%~dp0listos\anuncios-ugc"
) else (
  echo.
  echo  No salio ningun anuncio: lee el mensaje de arriba. Tambien puedes usar el panel: boton "Anuncios UGC".
)
pause
