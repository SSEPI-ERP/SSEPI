@echo off
chcp 65001 >nul
echo =========================================
echo   SSEPI - Abrir puerto en Firewall
echo =========================================
echo.
echo Este script necesita ejecutarse COMO ADMINISTRADOR.
echo.
netsh advfirewall firewall show rule name="SSEPI Local" >NUL 2>NUL
if %errorlevel%==0 (
    echo La regla "SSEPI Local" ya existe.
    echo.
    echo Opciones:
    echo   [1] Eliminar y recrear
    echo   [2] Ver estado actual
    echo   [3] Salir
    set /p opcion=Elige (1/2/3):
    if "%opcion%"=="1" (
        netsh advfirewall firewall delete rule name="SSEPI Local"
        goto CREAR
    )
    if "%opcion%"=="2" (
        netsh advfirewall firewall show rule name="SSEPI Local"
    )
    goto FIN
) else (
    :CREAR
    echo Creando regla "SSEPI Local" para puerto 3333...
    netsh advfirewall firewall add rule name="SSEPI Local" dir=in action=allow protocol=tcp localport=3333
    if %errorlevel%==0 (
        echo.
        echo [OK] Regla creada exitosamente.
    ) else (
        echo.
        echo [ERROR] No se pudo crear la regla.
        echo Asegurate de ejecutar este script como Administrador.
        echo Click derecho -> "Ejecutar como administrador"
    )
)

:FIN
echo.
echo =========================================
echo Presiona cualquier tecla para salir...
pause >NUL
