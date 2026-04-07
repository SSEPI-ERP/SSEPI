@echo off
chcp 65001 >nul
set "COI_ROOT=%~dp0.."
cd /d "%COI_ROOT%"
echo.
echo === Crear .venv e instalar dependencias ===
echo Carpeta: %CD%
echo.

where py >nul 2>nul && set "PY=py -3" && goto havepy
where python >nul 2>nul && set "PY=python" && goto havepy
echo ERROR: No hay Python en el PATH.
echo Instala Python desde python.org (marca Add python.exe to PATH) o usa opcion 3 o 4 del menu.
pause
exit /b 1

:havepy
if not exist ".venv\Scripts\python.exe" (
  echo Creando entorno virtual .venv ...
  %PY% -m venv .venv
  if errorlevel 1 (
    echo Fallo venv. Prueba: py -3 -m venv .venv
    pause
    exit /b 1
  )
)

call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip
echo.
echo Instalando requirements.txt ...
pip install -r "%COI_ROOT%\requirements.txt"
if errorlevel 1 (
  echo Hubo errores. Revisa mensajes arriba.
  pause
  exit /b 1
)
echo.
echo Listo. Abre el COI con SSEPI COI.vbs o el acceso directo del escritorio.
pause
