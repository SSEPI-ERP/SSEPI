@echo off
cd /d "%~dp0\.."
echo.
echo  SSEPI — Iniciando Editor (8765) y Comparador (8766)
echo.
start "SSEPI Editor :8765" cmd /k "%~dp0INICIAR_EDITOR.bat"
timeout /t 2 /nobreak >nul
start "SSEPI Comparador :8766" cmd /k "%~dp0INICIAR_COMPARADOR.bat"
echo  Dos ventanas abiertas. No cierre las ventanas CMD mientras use el navegador.
pause
