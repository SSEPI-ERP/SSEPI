@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cls
echo =========================================
echo   SSEPI - REINICIO RAPIDO V16
echo   Mata procesos + seed demo + verify + server + tunel
echo.
echo   NO reimporta Pac_Contactos ni reportes ERP.
echo   Para importacion completa: reiniciar-ssepi.bat
echo =========================================
echo.
pause

:: Matar ventanas y procesos
taskkill /F /FI "WINDOWTITLE eq SSEPI SERVER*" 2>nul
taskkill /F /FI "WINDOWTITLE eq SSEPI VPS SERVER*" 2>nul
taskkill /F /FI "WINDOWTITLE eq Cloudflare Tunnel SSEPI*" 2>nul
taskkill /F /FI "WINDOWTITLE eq SSEPI Chrome*" 2>nul
taskkill /F /IM node.exe 2>nul
taskkill /F /IM cloudflared.exe 2>nul
timeout /t 3 /nobreak >nul
for %%P in (3333 3443) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul
)
timeout /t 2 /nobreak >nul

cd /d "%~dp0ssepinext"

echo [1/4] Seed demo Auto + Ventas + Compras + Facturacion...
node seed-orden-automatizacion-unica.mjs
if %errorlevel% neq 0 (
    echo      ERROR seed demo — revisa consola
    pause
    exit /b 1
)

echo [2/4] Verificacion demo + cotizaciones Ventas...
node verify-orden-demo.mjs
if %errorlevel% neq 0 (
    echo      AVISO: verify fallo — Historial/Kanban Ventas puede estar vacio
) else (
    echo      OK - Demo y cotizaciones listas para Ventas
)

echo [3/4] Arrancando servidor (JS sin cache en /panel)...
start "SSEPI VPS SERVER" cmd /k "title SSEPI VPS SERVER && node offline-server.mjs"

set "SERVER_OK=0"
for /L %%I in (1,1,30) do (
    curl -s http://localhost:3333/api/health >nul 2>nul
    if !errorlevel!==0 set "SERVER_OK=1" & goto :READY
    timeout /t 2 /nobreak >nul
)
echo AVISO: servidor no respondio en 60s.
pause
exit /b 1

:READY
echo      OK - http://localhost:3333

echo [4/4] Tunel Cloudflare...
start "Cloudflare Tunnel SSEPI" /D "%~dp0ssepinext" cmd /k "title Cloudflare Tunnel SSEPI && iniciar-tunel-cloudflare.bat"

echo.
echo =========================================
echo   LISTO — usa URL NUEVA del tunel
echo   Local: http://localhost:3333/panel/login.html
echo.
echo   Tras abrir el ERP: Ctrl+F5 en cada modulo
echo   Ventas: ventas.js v12, pdf v8
echo   Compras: compras.js v12, pdf v8
echo   Auto: servicios.js v21 ^| Motores: v3
echo =========================================
pause
