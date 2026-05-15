@echo off
chcp 65001 >nul
echo [SSEPI] Matando TODOS los procesos node.exe...
taskkill /F /IM node.exe 2>nul
echo [SSEPI] Esperando 2 segundos...
timeout /t 2 /nobreak >nul

echo [SSEPI] Verificando puerto 3333...
netstat -ano | findstr ":3333" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo [SSEPI] AUN hay algo en 3333. Intentando matar por PID...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3333" ^| findstr "LISTENING"') do (
        echo [SSEPI] Matando PID %%a...
        taskkill /F /PID %%a 2>nul
    )
    timeout /t 2 /nobreak >nul
)

echo [SSEPI] Verificando datos base...
cd /d "%~dp0"
node seed-all-check.mjs

echo [SSEPI] Arrancando servidor offline...
node offline-server.mjs
