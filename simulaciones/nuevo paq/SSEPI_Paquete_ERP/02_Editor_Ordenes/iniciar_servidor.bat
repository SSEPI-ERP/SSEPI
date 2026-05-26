@echo off
cd /d "%~dp0"

echo.
echo  Carpeta: %CD%
echo.

if not exist "editor_ordenes.html" (
  echo  ERROR: Falta editor_ordenes.html en esta carpeta.
  pause
  exit /b 1
)

if not exist "datos_ordenes_editables.json" (
  echo  Generando datos_ordenes_editables.json ...
  python -u limpiar_datos.py
  echo.
)

echo  Liberando puerto 8765 si otro servidor lo usa (no uses http.server en info\) ...
powershell -NoProfile -Command "$p=8765; Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

echo  Iniciando servidor del editor ...
echo.

python servidor_local.py

pause
