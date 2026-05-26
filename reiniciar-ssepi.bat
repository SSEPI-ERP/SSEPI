@echo off

chcp 65001 >nul

cls

echo =========================================

echo   SSEPI ERP - VPS LOCAL V14

echo   %date% %time%

echo   Offline completo + tunel Cloudflare (aprobacion remota)

echo   Importa: contactos, tabulador, calculadoras, inventario,

echo   BOM, ordenes lab (paquete ERP), ERP maestro, pipeline

echo =========================================

echo.



set "LOGDIR=%~dp0ssepinext\logs"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

set "LOGFILE=%LOGDIR%\import-%date:~-4%%date:~3,2%%date:~0,2%-%time:~0,2%%time:~3,2%%time:~6,2%.log"

set "LOGFILE=%LOGFILE: =0%"



for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4" ^| findstr /V "169.254"') do (

    for /f "tokens=*" %%b in ("%%a") do (

        echo.

        echo   ACCESO RED LAN: http://%%~nb:3333/panel/panel.html

    )

)

echo.



:: [1] Matar procesos Node y liberar puerto

echo [1] Matando procesos Node y limpiando puertos 3333 y 3443...

taskkill /F /IM node.exe 2>nul

timeout /t 2 /nobreak >nul

for %%P in (3333 3443) do (

    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul

)

echo      Puertos 3333/3443 libres.



:: [2] Integridad BD local (evitar ssepi-local.db en 0 bytes)

echo [2] Verificando base de datos local...

cd /d "%~dp0ssepinext"

if exist "data\ssepi-local.db" (

    for %%F in ("data\ssepi-local.db") do if %%~zF LSS 16 (

        echo      AVISO: BD corrupta/vacia — se elimina para recrear.

        del /q "data\ssepi-local.db" 2>nul

        del /q "data\ssepi-local.db-journal" 2>nul

    ) else (

        echo      OK - ssepi-local.db %%~zF bytes.

    )

) else (

    echo      Sin BD previa — se creara en los seeds.

)

if exist "data\ssepi-local.db-journal" del /q "data\ssepi-local.db-journal" 2>nul



:: [2b] Limpiar contactos inventados (solo reales de imagenes)

echo [2b] Limpiando contactos inventados...

node limpiar-contactos-db.mjs

if %errorlevel% neq 0 echo      (Aviso limpiar-contactos)



:: [2a] Usuarios offline

echo [2a] Usuarios offline...

node seed-usuarios.mjs

if %errorlevel% neq 0 echo      (Aviso seed-usuarios)



:: [2c] Seed contactos idempotente

echo [2c] Seed contactos base...

node seed-limpiar-contactos.mjs

if %errorlevel% neq 0 echo      (Aviso seed-limpiar-contactos)



:: [3a] Generar datos_comparador si falta (ERP maestro)

echo [3a] ERP Maestro JSON (datos_comparador)...

set "COMPARADOR=%~dp0simulaciones\escaner de imagenes\info\datos_comparador.json"

if not exist "%COMPARADOR%" (

    echo      Generando datos_comparador.json ...

    cd /d "%~dp0scripts\imports"

    node build-erp-maestro.mjs

    cd /d "%~dp0ssepinext"

) else (

    echo      OK - datos_comparador.json existe.

)



:: [3d] Inventario

echo [3d] Inventario electronica...

node seed-inventario.mjs

if %errorlevel% neq 0 echo      (Error inventario)



:: [3e] Consumibles taller

echo [3e] Consumibles taller...

node seed-consumibles.mjs

if %errorlevel% neq 0 echo      (Error consumibles)



:: [3f] BOM automatizacion

echo [3f] BOM automatizacion...

node seed-bom.mjs

if %errorlevel% neq 0 echo      (Error BOM)



:: [3i] Calculadoras y tabulador

echo [3i] Calculadoras / tabulador / hoja Excel...

node seed-calculadoras.mjs

if %errorlevel% neq 0 echo      (Error calculadoras - revisa consola)



:: [3j] Tabulador Excel — 50 clientes oficiales (Ventas / cotización)

echo [3j] Tabulador 50 clientes (TABULADOR DE COTIZACION actualizado.xlsx)...

node seed-tabulador-50.mjs

if %errorlevel% neq 0 echo      (Error seed-tabulador-50)


:: [3j2] Contactos ERP maestro (Odoo export + cruces) — llena telefono/email/rfc/direccion

echo [3j2] Contactos ERP maestro (Odoo export + cruces)...

node seed-erp-maestro-local.mjs --replace-contactos

if %errorlevel% neq 0 echo      (Error contactos ERP — ejecuta build-erp-maestro.mjs)



:: [3k] Importar ordenes desde SSEPI_Paquete_ERP (JSON + carpetas reportes/)

echo [3k] Importando desde simulaciones\SSEPI_Paquete_ERP (datos_ordenes_editables + reportes/)...

echo      Log: %LOGFILE%

powershell -NoProfile -Command "node importar-reportes-a-bd.mjs 2>&1 | ForEach-Object { Write-Host $_; $_ }" >> "%LOGFILE%"

if %errorlevel%==0 (

    echo      OK - Reportes importados. Ver resumen al final del log.

) else (

    echo      ERROR en importacion - abre %LOGFILE%

)



:: [3k-fix] SP-E/SP-M/SP-A al modulo correcto (taller/motores/auto)

echo [3k-fix] Corrigiendo clasificacion de folios...

node corregir-ordenes-modulo.mjs

if %errorlevel% neq 0 echo      (Aviso corregir-ordenes-modulo)



:: [3m] ERP Maestro — enriquecer tabulador / vinculos (idempotente)

echo [3m] ERP Maestro local (refuerzo tabulador)...

node seed-erp-maestro-local.mjs

if %errorlevel% neq 0 echo      (Error ERP maestro local)



:: [3l] Pipeline comercial

echo [3l] Pipeline comercial...

node seed-pipeline.mjs

if %errorlevel% neq 0 echo      (Aviso pipeline)



:: [3n] Actividades diarias

echo [3n] Actividades diarias...

node seed-actividades.mjs

if %errorlevel% neq 0 echo      (Aviso actividades)



:: [3o] Proyectos automatizacion (si no hay del import)

echo [3o] Proyectos automatizacion ejemplo...

node seed-proyectos-automatizacion.mjs

if %errorlevel% neq 0 echo      (Aviso proyectos auto)



:: [3p] Soporte de planta (si no hay del import)

echo [3p] Soporte de planta ejemplo...

node seed-proyectos-soporte-planta.mjs

if %errorlevel% neq 0 echo      (Aviso soporte planta)



:: [3z] Rellenar tablas vacias

echo [3z] Verificacion seeds (tablas vacias)...

node seed-all-check.mjs

if %errorlevel% neq 0 echo      (Aviso seed-all-check)



:: [3y] Resumen conteos

echo [3y] Verificacion final de datos...

node verificar-importacion.mjs

if %errorlevel% neq 0 (

    echo.

    echo   *** FALTAN DATOS — revisa errores arriba o el log ***

    echo.

) else (

    echo      OK - Tablas criticas con datos.

)



:: [4] Servidor offline

echo [4] Arrancando servidor VPS SSEPI NEXT (offline)...

start "SSEPI VPS SERVER" cmd /k "cd /d %~dp0ssepinext && node offline-server.mjs"



:: [5] Esperar servidor

echo [5] Esperando servidor (6s)...

timeout /t 6 /nobreak >nul



:: [6] Health check

echo [6] Verificando servidor...

curl -s http://localhost:3333/api/health >nul 2>nul

if %errorlevel%==0 (

    echo      OK - Servidor activo en http://localhost:3333

) else (

    echo      AVISO: Sin respuesta aun — espera y recarga el panel.

)



:: [7] Chrome local

echo [7] Abriendo Chrome (perfil temporal, localhost)...

set "SSEPI_PROFILE=%TEMP%\ssepi-chrome-%RANDOM%"

mkdir "%SSEPI_PROFILE%" 2>nul

start "SSEPI Chrome Local" chrome --user-data-dir="%SSEPI_PROFILE%" --no-first-run --no-default-browser-check --disable-popup-blocking --new-tab "http://localhost:3333/panel/login.html"



:: [8] Tunel Cloudflare (URL publica temporal para aprobar desde otro dispositivo)

echo [8] Iniciando tunel Cloudflare...

echo      Se abrira otra ventana con la URL trycloudflare.com

start "Cloudflare Tunnel SSEPI" /D "%~dp0ssepinext" cmd /k iniciar-tunel-cloudflare.bat



echo.

echo =========================================

echo   SSEPI LOCAL + TUNEL - LISTO

echo.

echo   Local:  http://localhost:3333/panel/login.html

echo   Tunel:  ventana "Cloudflare Tunnel SSEPI" muestra URL publica

echo   Log:    %LOGFILE%

echo.

echo   Usuarios offline (pass Ssepi2025!):

echo     norbertomoro4@gmail.com     — Norberto Moro

echo     ventas1@ssepi.org           — Carlos Calderon

echo     laboratorio1@ssepi.org      — Javier

echo     electronica@ssepi.org       — Javier

echo     electronica.ssepi@gmail.com — Aron

echo     motores1@ssepi.org          — Becerra

echo     automatizacion1@ssepi.org   — Tecnico

echo     ivang.ssepi@gmail.com       — Ivan

echo     administracion@ssepi.org    — Administracion

echo     ventas@ssepi.org            — Daniel Zuniga

echo     automatizacion@ssepi.org    — Arturo

echo     compras@ssepi.org           — Itzel

echo =========================================

echo.

pause

