@echo off
chcp 65001 >nul
echo Intentando: winget install Python.Python.3.12 ...
echo Si falla, ejecuta como Administrador o instala Python a mano (opcion 3).
winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
echo.
echo Cierra y vuelve a abrir CMD para actualizar PATH. Luego opcion 1.
pause
