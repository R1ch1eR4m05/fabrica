@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  == Fabrica de videos: instalacion ==
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Falta Node.js. Instalalo desde https://nodejs.org ^(version 22 o mas nueva^) y vuelve a abrir este archivo.
  start https://nodejs.org
  pause
  exit /b 1
)
echo  Instalando dependencias ^(motor de render y ffmpeg^)...
call npm install --no-audit --no-fund
if errorlevel 1 ( echo  Algo fallo con npm install. & pause & exit /b 1 )
echo  Instalando el navegador del render ^(una sola vez^)...
call npx playwright install chromium
if not exist ".env" copy ".env.example" ".env" >nul
echo.
echo  Listo. Pon tus llaves en el archivo .env ^(se abre ahora^) y luego abre "Abrir fabrica (Windows).cmd".
notepad ".env"
pause
