@echo off
cd /d "%~dp0"
echo SSEPI COI - Motor bridge (puerto 8765)
echo.
python -m bridge.bridge_server
pause
