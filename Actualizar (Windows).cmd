@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  == Actualizando la fabrica ==
where git >nul 2>nul
if errorlevel 1 ( echo  Falta Git. Instalalo desde https://git-scm.com y vuelve a abrir este archivo. & start https://git-scm.com/download/win & pause & exit /b 1 )
git fetch origin main
if errorlevel 1 (
  echo.
  echo  No pude conectarme a GitHub. Revisa tu internet y vuelve a intentarlo.
  pause & exit /b 1
)
rem Si algun archivo de la fabrica cambio en esta compu, se guarda aparte (git stash) y se pone la version nueva.
rem Tus videos, proyectos, investigaciones y el .env no estan en GitHub, asi que no se tocan.
git diff --quiet HEAD 2>nul
if errorlevel 1 ( echo  Guardando aparte los cambios locales... & git stash push -m "antes de actualizar" >nul )
git reset --hard origin/main
if errorlevel 1 (
  echo.
  echo  No se pudo actualizar. Pidele ayuda a Claude con este mensaje.
  pause & exit /b 1
)
call npm install --no-audit --no-fund
echo.
echo  Listo. Ya tienes la version mas nueva. Abre "Abrir fabrica (Windows).cmd".
pause
