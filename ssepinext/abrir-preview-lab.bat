@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo =========================================
echo   SSEPI - Prueba formato laboratorio-1
echo   (misma UI que carpeta 05)
echo =========================================
echo.

echo [1] Generando JSON desde BD importada...
node generar-datos-preview-formato.mjs
if %errorlevel% neq 0 (
    echo ERROR: ejecuta importar-reportes-a-bd.mjs primero.
    pause
    exit /b 1
)

echo.
echo [2] Arrancando servidor preview (puerto 3334)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3334" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul
start "SSEPI Preview Server" cmd /k "cd /d %~dp0 && node preview-server.mjs"

echo [3] Esperando servidor (3s)...
timeout /t 3 /nobreak >nul

echo [4] Abriendo prueba visual...
start "" "http://localhost:3334/prueba-formato-laboratorio.html"

echo.
echo   URL: http://localhost:3334/prueba-formato-laboratorio.html
echo   Selector con las 181 ordenes importadas.
echo.
pause
