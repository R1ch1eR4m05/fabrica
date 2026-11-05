@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  == Actualizando la fabrica ==
where git >nul 2>nul
if errorlevel 1 ( echo  Falta Git. Instalalo desde https://git-scm.com y vuelve a abrir este archivo. & start https://git-scm.com/download/win & pause & exit /b 1 )
git pull --ff-only
if errorlevel 1 (
  echo.
  echo  No se pudo actualizar solo. Probablemente cambiaste algun archivo de la fabrica a mano.
  echo  Tus videos, tu .env y tus proyectos NO se tocan. Pidele ayuda a Claude con este mensaje.
  pause & exit /b 1
)
call npm install --no-audit --no-fund
echo.
echo  Listo. Ya tienes la version mas nueva. Abre "Abrir fabrica (Windows).cmd".
pause
