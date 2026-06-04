@echo off
chcp 65001 >nul
echo [SSEPI] Matando TODOS los procesos node.exe y cloudflared.exe...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM cloudflared.exe 2>nul
taskkill /F /FI "WINDOWTITLE eq SSEPI SERVER*" 2>nul
taskkill /F /FI "WINDOWTITLE eq Cloudflare Tunnel SSEPI*" 2>nul
echo [SSEPI] Esperando 3 segundos para liberar puertos...
timeout /t 3 /nobreak >nul

echo [SSEPI] Verificando puertos 3333 y 3443...
netstat -ano | findstr ":3333" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo [SSEPI] AUN hay algo en 3333. Intentando matar por PID...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3333" ^| findstr "LISTENING"') do (
        echo [SSEPI] Matando PID %%a...
        taskkill /F /PID %%a 2>nul
    )
    timeout /t 2 /nobreak >nul
)
netstat -ano | findstr ":3443" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo [SSEPI] AUN hay algo en 3443. Intentando matar por PID...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3443" ^| findstr "LISTENING"') do (
        echo [SSEPI] Matando PID %%a...
        taskkill /F /PID %%a 2>nul
    )
    timeout /t 2 /nobreak >nul
)

echo [SSEPI] Verificando datos base...
cd /d "%~dp0"
echo Importando contactos Pac_Contactos...
node seed-erp-maestro-local.mjs
if %errorlevel% neq 0 echo (Aviso seed-erp-maestro-local)
node seed-all-check.mjs

echo [SSEPI] Arrancando servidor offline...
node offline-server.mjs
