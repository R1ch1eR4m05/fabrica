@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Fabrica de videos (no cierres esta ventana)
node fabrica.js panel
pause
