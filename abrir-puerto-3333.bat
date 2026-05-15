@echo off
echo Abriendo puerto 3333 en Windows Firewall para SSEPI ERP...
echo.
echo Ejecuta este archivo COMO ADMINISTRADOR (clic derecho - Ejecutar como administrador)
echo.
netsh advfirewall firewall add rule name="SSEPI ERP Port 3333" dir=in action=allow protocol=TCP localport=3333
if %errorlevel%==0 (
    echo.
    echo OK - Puerto 3333 abierto correctamente.
    echo.
    echo Otros dispositivos pueden acceder en:
    echo.
    ipconfig | findstr "IPv4"
    echo.
    echo URL: http://TU_IP:3333/panel/login.html
    echo.
) else (
    echo.
    echo ERROR: Necesitas ejecutar como Administrador.
    echo Clic derecho en este archivo - "Ejecutar como administrador"
)
pause