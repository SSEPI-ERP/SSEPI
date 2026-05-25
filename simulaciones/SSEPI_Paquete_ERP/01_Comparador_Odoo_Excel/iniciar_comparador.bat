@echo off
cd /d "%~dp0"

echo.
echo  Servidor COMPARADOR (carpeta info) — puerto 8766
echo  No cierra el editor en 8765.
echo.

if not exist "comparador_clientes.html" (
  echo  ERROR: Falta comparador_clientes.html
  pause
  exit /b 1
)

if not exist "datos_embebidos.js" (
  echo  AVISO: Falta datos_embebidos.js — ejecuta: python build_comparador.py
  echo.
)

python servidor_comparador.py
pause
