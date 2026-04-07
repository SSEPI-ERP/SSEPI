@echo off
cd /d "%~dp0.."
if exist ".venv\Scripts\python.exe" (
  .venv\Scripts\python.exe scripts\generar_icono_desde_logo.py
) else (
  py -3 scripts\generar_icono_desde_logo.py 2>nul || python scripts\generar_icono_desde_logo.py
)
pause
