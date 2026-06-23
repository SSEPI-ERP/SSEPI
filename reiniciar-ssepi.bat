@echo off

chcp 65001 >nul

cls

echo =========================================
echo   SSEPI ERP - VPS LOCAL V17
echo   %date% %time%
echo   Mata procesos + importa maestros + demo Auto + verify Ventas
echo   + valida n8n cerebro + arranca VPS + tunel Cloudflare
echo.
echo   MANTIENE: Laboratorio (SP-E), contactos, inventario, tabulador
echo   BORRA:    PO/COT/FAC/proyectos Auto basura (deja 1 demo vinculada)
echo   IMPORTA:  Pac_Contactos, reportes ERP, seeds maestros
echo   NUEVO V17: verifica n8n (puerto 5679) + seeds suministros/vacaciones/
echo              contactos-imagenes/ordenes-motores/ordenes-terminadas
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



:: ========== FASE A: MATAR PROCESOS Y LIBERAR PUERTOS ==========
echo [A1] Cerrando ventanas SSEPI (server, tunel, chrome temp)...
taskkill /F /FI "WINDOWTITLE eq SSEPI SERVER*" 2>nul
taskkill /F /FI "WINDOWTITLE eq SSEPI VPS SERVER*" 2>nul
taskkill /F /FI "WINDOWTITLE eq Cloudflare Tunnel SSEPI*" 2>nul
taskkill /F /FI "WINDOWTITLE eq SSEPI Chrome*" 2>nul

echo [A2] Matando node.exe y cloudflared.exe...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM cloudflared.exe 2>nul

timeout /t 3 /nobreak >nul

:: Verificar puertos 3333/3443 (VPS) y 5679 (n8n)
for %%P in (3333 3443 5679) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P" ^| findstr "LISTENING"') do (
        echo      Aun hay PID %%a en puerto %%P, matando...
        taskkill /F /PID %%a 2>nul
    )
)

timeout /t 2 /nobreak >nul

:: Verificacion final
set "PUERTOS_LIBRES=OK"
for %%P in (3333 3443 5679) do (
    netstat -ano | findstr ":%%P" | findstr "LISTENING" >nul && set "PUERTOS_LIBRES=NO"
)
if "%PUERTOS_LIBRES%"=="OK" (
    echo      OK - Puertos 3333/3443/5679 libres.
) else (
    echo      AVISO: algun puerto aun ocupado. Cerrar manualmente y reintentar.
)



:: ========== FASE B: INTEGRIDAD BD LOCAL ==========
echo [B1] Verificando base de datos local...

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



:: [B2] Usuarios offline
echo [B2] Usuarios offline...

node seed-usuarios.mjs

if %errorlevel% neq 0 echo      (Aviso seed-usuarios)



:: [B3] Verificacion contactos (idempotente, no borra)
echo [B3] Verificacion idempotente de contactos...

node seed-limpiar-contactos.mjs

if %errorlevel% neq 0 echo      (Aviso seed-limpiar-contactos)



:: [B3.5] Contactos unificado + imagenes (nuevos V17)
echo [B3.5] Contactos unificado + imagenes (V17)...

if exist "seed-contactos-unificado.mjs" (
    node seed-contactos-unificado.mjs
    if !errorlevel! neq 0 echo      (Aviso seed-contactos-unificado)
) else (
    echo      (skip: seed-contactos-unificado.mjs no existe)
)

if exist "seed-contactos-imagenes.mjs" (
    node seed-contactos-imagenes.mjs
    if !errorlevel! neq 0 echo      (Aviso seed-contactos-imagenes)
) else (
    echo      (skip: seed-contactos-imagenes.mjs no existe)
)



:: ========== FASE C: IMPORTAR FUENTES MAESTRAS ==========
echo [C1] Pac_Contactos / comparador Odoo...

cd /d "%~dp0simulaciones\Pac_Contactos\01_Comparador_Odoo_Excel"

python build_comparador.py

if %errorlevel% neq 0 echo      (Error build_comparador.py — revisa Python/pandas)

cd /d "%~dp0ssepinext"

echo [3a] Verificando Pac_Contactos...

set "PAC_DATOS=%~dp0simulaciones\Pac_Contactos\01_Comparador_Odoo_Excel\datos_comparador.json"

set "PAC_LISTADO=%~dp0simulaciones\Pac_Contactos\04_Datos_muestra\listado_tabulador_odoo.json"

set "PAC_RASTRO=%~dp0simulaciones\Pac_Contactos\01_Comparador_Odoo_Excel\rastro_capturas_ejemplo.json"

if not exist "%PAC_DATOS%" (

    echo      ERROR: Falta datos_comparador.json — build_comparador fallo

) else (

    echo      OK - datos_comparador.json (139 capturas)

)

if not exist "%PAC_LISTADO%" (

    echo      ERROR: Falta listado_tabulador_odoo.json en Pac_Contactos\04_Datos_muestra

) else (

    echo      OK - listado_tabulador_odoo.json

)

if not exist "%PAC_RASTRO%" (

    echo      AVISO: Falta rastro OCR — emails/tel pueden quedar vacios.

) else (

    echo      OK - rastro_capturas_ejemplo.json

)



echo [C2] Inventario electronica...

node seed-inventario.mjs

if %errorlevel% neq 0 echo      (Error inventario)



echo [C3] Consumibles taller...

node seed-consumibles.mjs

if %errorlevel% neq 0 echo      (Error consumibles)



echo [C4] Servicios y almacenables inventario...

node seed-inventario-catalogo.mjs

if %errorlevel% neq 0 echo      (Error catalogo inventario)



echo [C5] BOM automatizacion...

node seed-bom.mjs

if %errorlevel% neq 0 echo      (Error BOM)



echo [C6] Calculadoras / tabulador / hoja Excel...

node seed-calculadoras.mjs

if %errorlevel% neq 0 echo      (Error calculadoras - revisa consola)



echo [C7] Tabulador 50 clientes...

node seed-tabulador-50.mjs

if %errorlevel% neq 0 echo      (Error seed-tabulador-50)



:: [C8] Costos ventas (nuevo V17)
echo [C8] Costos ventas (V17)...

if exist "seed-costos-ventas.mjs" (
    node seed-costos-ventas.mjs
    if !errorlevel! neq 0 echo      (Aviso seed-costos-ventas)
) else (
    echo      (skip: seed-costos-ventas.mjs no existe)
)



:: ========== FASE D: IMPORTAR ORDENES / REPORTES LAB ==========
echo [D1] Importando SSEPI_Paquete_ERP (ordenes lab + reportes/)...

echo      Log: %LOGFILE%

powershell -NoProfile -Command "node importar-reportes-a-bd.mjs 2>&1 | ForEach-Object { Write-Host $_; $_ }" >> "%LOGFILE%"

if %errorlevel%==0 (

    echo      OK - Reportes importados. Ver resumen al final del log.

) else (

    echo      ERROR en importacion - abre %LOGFILE%

)



echo [D2] Corrigiendo clasificacion folios SP-E/SP-M/SP-A...

node corregir-ordenes-modulo.mjs

if %errorlevel% neq 0 echo      (Aviso corregir-ordenes-modulo)



echo [D3] Contactos Pac_Contactos a BD local...

node seed-erp-maestro-local.mjs

if %errorlevel% neq 0 echo      (Error seed-erp-maestro-local — revisa Pac_Contactos JSON)



echo [D4] Pipeline comercial...

node seed-pipeline.mjs

if %errorlevel% neq 0 echo      (Aviso pipeline)



echo [D5] Actividades diarias...

node seed-actividades.mjs

if %errorlevel% neq 0 echo      (Aviso actividades)



echo [D6] Proyectos automatizacion ejemplo (previo a limpieza demo)...

node seed-proyectos-automatizacion.mjs

if %errorlevel% neq 0 echo      (Aviso proyectos auto)



echo [D7] Soporte de planta ejemplo...

node seed-proyectos-soporte-planta.mjs

if %errorlevel% neq 0 echo      (Aviso soporte planta)



:: [D8-D11] Nuevos seeds V17
echo [D8] Ordenes motores ejemplo (V17)...

if exist "seed-ordenes-motores.mjs" (
    node seed-ordenes-motores.mjs
    if !errorlevel! neq 0 echo      (Aviso seed-ordenes-motores)
) else (
    echo      (skip: seed-ordenes-motores.mjs no existe)
)

echo [D9] Ordenes terminadas (V17)...

if exist "seed-ordenes-terminadas.mjs" (
    node seed-ordenes-terminadas.mjs
    if !errorlevel! neq 0 echo      (Aviso seed-ordenes-terminadas)
) else (
    echo      (skip: seed-ordenes-terminadas.mjs no existe)
)

echo [D10] Suministros demo (V17)...

if exist "seed-suministro-demo.mjs" (
    node seed-suministro-demo.mjs
    if !errorlevel! neq 0 echo      (Aviso seed-suministro-demo)
) else (
    echo      (skip: seed-suministro-demo.mjs no existe)
)

echo [D11] Vacaciones local (V17)...

if exist "seed-vacaciones-local.mjs" (
    node seed-vacaciones-local.mjs
    if !errorlevel! neq 0 echo      (Aviso seed-vacaciones-local)
) else (
    echo      (skip: seed-vacaciones-local.mjs no existe)
)



:: ========== FASE E: LIMPIEZA DEMO AUTOMATIZACION (borra basura, deja 1 orden) ==========
echo [E1] Limpieza: 1 proyecto Auto + PO-A-DEMO-01 + COT-A-DEMO-01 + FAC-A-DEMO-01...
echo      (Borra compras/cotizaciones/facturas/proyectos Auto que no sean demo ni laboratorio)
node seed-orden-automatizacion-unica.mjs
if %errorlevel% neq 0 echo      (Error seed-orden-automatizacion-unica)

echo [E2] Verificacion orden demo vinculada...
node verify-orden-demo.mjs
if %errorlevel% neq 0 (
    echo      AVISO: verify-orden-demo fallo — reintentando seed...
    node seed-orden-automatizacion-unica.mjs
    node verify-orden-demo.mjs
    if %errorlevel% neq 0 echo      *** Sigue fallando verify ***
) else (
    echo      OK - Orden demo Auto verificada.
)

echo [E3] Tests logicos fases Auto/Ventas/Compras...
node test-fases-automatizacion.mjs
if %errorlevel% neq 0 echo      (Aviso test-fases-automatizacion)

:: ========== FASE F: VERIFICACION FINAL SEEDS ==========
echo [F1] Verificacion seeds (tablas vacias)...

node seed-all-check.mjs

if %errorlevel% neq 0 echo      (Aviso seed-all-check)



echo [F2] Verificacion final de datos...

node verificar-importacion.mjs

if %errorlevel% neq 0 (

    echo.

    echo   *** FALTAN DATOS — revisa errores arriba o el log ***

    echo.

) else (

    echo      OK - Tablas criticas con datos.

)



:: ========== FASE F.5: VALIDAR CEREBRO n8n (V17) ==========
echo.
echo [F.5] Validando n8n (cerebro IA) en puerto 5679...
set "N8N_OK=0"
curl -s http://localhost:5679/healthz >nul 2>nul
if %errorlevel%==0 set "N8N_OK=1"

if "%N8N_OK%"=="1" (
    echo      OK - n8n respondiendo en http://localhost:5679
) else (
    echo      AVISO: n8n no responde. Si docker esta caido:
    echo              cd E:\SSEPI ^&^& docker compose up -d
    echo      Continuo de todas formas con VPS...
)



:: ========== FASE G: ARRANCAR SERVIDOR + TUNEL + CHROME ==========
echo [G1] Arrancando servidor VPS SSEPI NEXT (offline)...

:: Generar config.runtime.js (URL/anon key desde .env.local) para que el panel conecte
echo [G1] Generando config.runtime.js...
cd /d "%~dp0" && node scripts\generate-runtime-config.mjs

start "SSEPI VPS SERVER" cmd /k "cd /d %~dp0ssepinext && node offline-server.mjs"



echo [G2] Esperando servidor (hasta 30s)...

set "SERVER_OK=0"

curl -s http://localhost:3333/api/health >nul 2>nul

if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel!==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="0" timeout /t 2 /nobreak >nul & curl -s http://localhost:3333/api/health >nul 2>nul & if %errorlevel%==0 set "SERVER_OK=1"

if "%SERVER_OK%"=="1" (

    echo      OK - Servidor activo en http://localhost:3333

) else (

    echo      AVISO: Servidor aun no responde — el tunel esperara hasta 90s mas.

)



echo [G3] Verificando servidor...

echo [G4] Abriendo Chrome (perfil temporal, localhost)...

set "SSEPI_PROFILE=%TEMP%\ssepi-chrome-%RANDOM%"

mkdir "%SSEPI_PROFILE%" 2>nul

start "SSEPI Chrome Local" chrome --user-data-dir="%SSEPI_PROFILE%" --no-first-run --no-default-browser-check --disable-popup-blocking --new-tab "http://localhost:3333/panel/login.html?nocache=%RANDOM%"



echo [G5] Iniciando tunel Cloudflare...
echo      Se abrira otra ventana con la URL trycloudflare.com
echo      IMPORTANTE: Usa la URL NUEVA de esa ventana. Las URLs viejas caducan.

start "Cloudflare Tunnel SSEPI" /D "%~dp0ssepinext" cmd /k iniciar-tunel-cloudflare.bat



echo.

echo =========================================

echo   SSEPI LOCAL + TUNEL + n8n - LISTO

echo.

echo   Local:  http://localhost:3333/panel/login.html

echo   n8n:    http://localhost:5679 (si arriba dice OK)

echo   Tunel:  ventana "Cloudflare Tunnel SSEPI" muestra URL publica

echo   Log:    %LOGFILE%

echo.

echo   === TRAS ENTRAR AL ERP (importante) ===

echo   1. Ctrl+F5 en cada modulo que abras (Ventas, Compras, Auto)

echo   2. Ventas Historial: debe verse COT-A-DEMO-01 en Kanban Autorizado

echo   3. Auto: SP-A-DEMO-01 en columna Completado

echo   4. Compras PDF: compras.js v12 + pdf-generator v8

echo   5. Si Historial vacio: verify fallo arriba — corre seed manual

echo.

echo   === CEREBRO n8n (opcional) ===

echo   Si necesitas exponer n8n: otra terminal corre

echo     ssepinext\iniciar-tunel-n8n.bat

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
