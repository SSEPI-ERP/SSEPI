@echo off
cd /d "%~dp0"
echo.
echo  Vista previa formato laboratorio-1
echo  Carpeta: %CD%
echo.
if not exist "prueba_formato_laboratorio.html" (
  echo  ERROR: Falta prueba_formato_laboratorio.html
  pause
  exit /b 1
)
if not exist "muestra_formato_laboratorio.json" (
  echo  AVISO: Falta muestra_formato_laboratorio.json
)
echo  Copia datos_reportes.json aqui para ver todas las ordenes.
echo.
python -u abrir_prueba_formato.py
pause
