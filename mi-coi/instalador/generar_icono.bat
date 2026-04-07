@echo off
chcp 65001 >nul
set "COI_ROOT=%~dp0.."
cd /d "%COI_ROOT%"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" scripts\generar_icono_desde_logo.py
) else (
  py -3 scripts\generar_icono_desde_logo.py 2>nul
  if errorlevel 1 python scripts\generar_icono_desde_logo.py
)
pause
