@echo off
REM Genera SSEPI-COI.exe (carpeta dist\) con PyInstaller. Requiere: pip install pyinstaller
cd /d "%~dp0.."

if not exist "main.py" (
  echo No se encuentra main.py
  pause
  exit /b 1
)

where py >nul 2>nul && set PY=py -3 || set PY=python

echo Instalando PyInstaller si hace falta...
%PY% -m pip install pyinstaller --quiet

set ICON=
if exist "assets\app.ico" set ICON=--icon=assets\app.ico

REM --onedir suele ser mas estable con Tkinter que --onefile
%PY% -m PyInstaller --noconfirm --clean --windowed --name "SSEPI-COI" %ICON% main.py

echo.
echo Si termino bien, prueba: dist\SSEPI-COI\SSEPI-COI.exe
echo Nota: la primera vez puede fallar por imports; revisa la consola o usa onedir y --hidden-import.
pause
