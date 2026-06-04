@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
cls
echo =========================================
echo  SSEPI ERP - Reinicio Completo (Local)
echo =========================================
echo.

:: [1] Matar todos los procesos Node y Cloudflare (incluyendo ventanas zombie de arranques anteriores)
echo [1] Cerrando procesos Node, cloudflared y ventanas zombie...
taskkill /F /IM node.exe 2> nul
taskkill /F /IM cloudflared.exe 2> nul
taskkill /F /FI "WINDOWTITLE eq SSEPI SERVER*" 2> nul
taskkill /F /FI "WINDOWTITLE eq Cloudflare Tunnel SSEPI*" 2> nul
timeout /t 3 /nobreak > nul

:: [2] Verificar que los puertos 3333 y 3443 quedaron libres
echo [2] Verificando puertos 3333 y 3443...
for %%P in (3333 3443) do (
    netstat -ano | findstr ":%%P" | findstr "LISTENING" > nul
    if !errorlevel!==0 (
        echo [2] AUN hay algo en %%P. Matando por PID...
        for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P" ^| findstr "LISTENING"') do (
            echo     Matando PID %%a...
            taskkill /F /PID %%a 2> nul
        )
        timeout /t 2 /nobreak > nul
    )
)

:: [3] Limpiar cache y journal de SQLite (NO borrar la base)
echo [3] Limpiando cache local...
del /q "%~dp0data\ssepi-local.db-journal" 2> nul

:: [3.5] Contactos Pac_Contactos + semillas si faltan
echo [3.5] Contactos Pac_Contactos...
cd /d "%~dp0"
node seed-erp-maestro-local.mjs
if %errorlevel% neq 0 echo      (Aviso seed-erp-maestro-local)
echo [3.6] Verificando datos base...
node seed-all-check.mjs

:: [4] Iniciar servidor offline (SSEPI NEXT local)
echo [4] Iniciando servidor offline local...
start "SSEPI SERVER" cmd /k "node offline-server.mjs"

:: [5] Esperar que levante
echo [5] Esperando servidor (5 segundos)...
timeout /t 5 /nobreak > nul

:: [6] Abrir navegador limpio
echo [6] Abriendo Chrome con perfil LIMPIO...
set "TMPDIR=%TEMP%\ssepi-chrome-%RANDOM%"
mkdir "%TMPDIR%" 2> nul
start chrome --user-data-dir="%TMPDIR%" --no-first-run --no-default-browser-check "http://localhost:3333/panel/login.html"

echo.
echo =========================================
echo  LISTO. Navegador limpio abierto.
echo.
echo  IMPORTANTE: La base es local (SQLite).
echo  Si faltan tablas nuevas, el servidor las
echo  crea automaticamente al arrancar.
echo.
  echo  Login local (contraseña: Ssepi2025!):
  echo    norbertomoro4@gmail.com     — Norberto Moro
  echo    ventas1@ssepi.org           — Carlos Calderon
  echo    ventas@ssepi.org            — Daniel Zuniga
  echo    laboratorio1@ssepi.org      — Javier
  echo    electronica@ssepi.org       — Javier
  echo    electronica.ssepi@gmail.com — Aron
  echo    motores1@ssepi.org          — Becerra
  echo    automatizacion1@ssepi.org   — Tecnico
  echo    ivang.ssepi@gmail.com       — Ivan
  echo    administracion@ssepi.org    — Administracion
  echo    automatizacion@ssepi.org    — Arturo
echo =========================================
pause
