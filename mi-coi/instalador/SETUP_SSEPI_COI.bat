@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
set "COI_ROOT=%~dp0.."
pushd "%COI_ROOT%" 2>nul || (echo No se pudo acceder a la carpeta del COI. & pause & exit /b 1)

:menu
cls
echo ============================================================
echo   SSEPI COI - Instalador y configuracion
echo ============================================================
echo.
echo   Carpeta del programa (instalacion en este equipo^):
echo   %CD%
echo.
echo   [1] Instalar dependencias Python (venv + pip^)  ^<-- PRIMERA VEZ
echo   [2] Solo actualizar paquetes pip (si ya tienes .venv^)
echo   [3] Abrir descarga de Python (python.org^)
echo   [4] Intentar instalar Python con winget (requiere permisos^)
echo   [5] Crear acceso directo "SSEPI COI" en el Escritorio
echo   [6] Generar icono app.ico desde logo.png
echo   [7] Ver instrucciones (copiar a otra PC^)
echo   [0] Salir
echo.
set /p OPC=Elige opcion (0-7): 
if "%OPC%"=="1" call "%~dp0instalar_venv_y_pip.bat"
if "%OPC%"=="2" call "%~dp0actualizar_pip.bat"
if "%OPC%"=="3" start https://www.python.org/downloads/windows/
if "%OPC%"=="4" call "%~dp0winget_python.bat"
if "%OPC%"=="5" call "%~dp0crear_acceso.bat"
if "%OPC%"=="6" call "%~dp0generar_icono.bat"
if "%OPC%"=="7" call "%~dp0ver_ayuda.bat"
if "%OPC%"=="0" goto fin
goto menu

:fin
popd
endlocal
exit /b 0
