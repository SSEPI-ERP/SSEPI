@echo off
chcp 65001 >nul
set "COI_ROOT=%~dp0.."
cd /d "%COI_ROOT%"
if not exist ".venv\Scripts\pip.exe" (
  echo No existe .venv. Usa opcion 1 primero.
  pause
  exit /b 1
)
call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip
pip install -r "%COI_ROOT%\requirements.txt" --upgrade
echo Listo.
pause
