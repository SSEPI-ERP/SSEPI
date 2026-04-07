@echo off
chcp 65001 >nul
set "COI_ROOT=%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%COI_ROOT%\scripts\crear_acceso_directo.ps1"
pause
