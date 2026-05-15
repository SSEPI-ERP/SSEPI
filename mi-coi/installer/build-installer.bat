@echo off
setlocal EnableDelayedExpansion

:: =========================================
:: SSEPI COI - Builder del Instalador
:: =========================================
set "PROJECT_ROOT=%~dp0.."
set "STAGING=%~dp0staging"
set "ISS_FILE=%~dp0SSEPI-COI-Setup.iss"
set "PYTHON_ARCHIVE=%~dp0python-portable.tar.gz"
set "GET_PIP_FILE=%~dp0get-pip.py"

:: URL de Python 3.12 portable con tkinter (python-build-standalone)
set "PYTHON_URL=https://github.com/astral-sh/python-build-standalone/releases/download/20260504/cpython-3.12.13%%2B20260504-x86_64-pc-windows-msvc-install_only.tar.gz"
set "GET_PIP_URL=https://bootstrap.pypa.io/get-pip.py"

echo =========================================
echo SSEPI COI - Builder del Instalador
echo =========================================

:: ---------------------------------------------------------------------------
:: 1. Verificar/Instalar Inno Setup
:: ---------------------------------------------------------------------------
echo [1/8] Verificando Inno Setup...
set "ISCC="
for %%p in (ISCC.exe) do set "ISCC=%%~$PATH:p"
if not defined ISCC (
    if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
        set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    ) else if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
        set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
    )
)

if not defined ISCC (
    echo Inno Setup no encontrado. Intentando instalar via winget...
    winget install --id JRSoftware.InnoSetup --accept-package-agreements --accept-source-agreements --silent
    if errorlevel 1 (
        echo ERROR: No se pudo instalar Inno Setup automaticamente.
        echo Descargalo manualmente desde https://jrsoftware.org/isdl.php
        pause
        exit /b 1
    )
    :: Reintentar buscar despues de instalar
    for %%p in (ISCC.exe) do set "ISCC=%%~$PATH:p"
    if not defined ISCC (
        if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
            set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
        ) else if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
            set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
        )
    )
)

if not defined ISCC (
    echo ERROR: ISCC.exe no encontrado despues de intentar instalar.
    pause
    exit /b 1
)
echo Encontrado ISCC: %ISCC%

:: ---------------------------------------------------------------------------
:: 2. Preparar staging
:: ---------------------------------------------------------------------------
echo [2/8] Preparando staging...
if exist "%STAGING%" (
    echo   Limpiando staging anterior...
    rmdir /s /q "%STAGING%"
)
mkdir "%STAGING%"

:: ---------------------------------------------------------------------------
:: 3. Descargar Python portable
:: ---------------------------------------------------------------------------
echo [3/8] Descargando Python 3.12 portable (con tkinter)...
if exist "%PYTHON_ARCHIVE%" (
    echo   Usando archivo existente: %PYTHON_ARCHIVE%
) else (
    echo   Descargando desde GitHub...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_ARCHIVE%' -UseBasicParsing"
    if errorlevel 1 (
        echo ERROR: Fallo la descarga de Python portable.
        pause
        exit /b 1
    )
)

:: ---------------------------------------------------------------------------
:: 4. Extraer Python portable
:: ---------------------------------------------------------------------------
echo [4/8] Extrayendo Python portable...
mkdir "%STAGING%\python"
tar -xzf "%PYTHON_ARCHIVE%" -C "%STAGING%\python" --strip-components=1
if errorlevel 1 (
    echo ERROR: Fallo la extraccion. Intentando con 7z...
    if exist "C:\Program Files\7-Zip\7z.exe" (
        "C:\Program Files\7-Zip\7z.exe" x "%PYTHON_ARCHIVE%" -o"%STAGING%\python" -y
    ) else (
        echo ERROR: No se pudo extraer el archivo tar.gz.
        pause
        exit /b 1
    )
)
echo   Python extraido correctamente.

:: ---------------------------------------------------------------------------
:: 5. Instalar pip
:: ---------------------------------------------------------------------------
echo [5/8] Instalando pip en Python portable...
if exist "%GET_PIP_FILE%" (
    echo   Usando get-pip.py existente...
) else (
    echo   Descargando get-pip.py...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri '%GET_PIP_URL%' -OutFile '%GET_PIP_FILE%' -UseBasicParsing"
)
"%STAGING%\python\python.exe" "%GET_PIP_FILE%"
if errorlevel 1 (
    echo ERROR: Fallo la instalacion de pip.
    pause
    exit /b 1
)

:: ---------------------------------------------------------------------------
:: 6. Instalar dependencias de la app
:: ---------------------------------------------------------------------------
echo [6/8] Instalando dependencias de la app...
"%STAGING%\python\python.exe" -m pip install -r "%PROJECT_ROOT%\requirements.txt"
if errorlevel 1 (
    echo ERROR: Fallo la instalacion de dependencias.
    pause
    exit /b 1
)

:: ---------------------------------------------------------------------------
:: 7. Copiar archivos de la aplicacion
:: ---------------------------------------------------------------------------
echo [7/8] Copiando archivos de la aplicacion...

:: Archivos raiz
copy /Y "%PROJECT_ROOT%\main.py" "%STAGING%\" >nul
copy /Y "%PROJECT_ROOT%\config.py" "%STAGING%\" >nul
copy /Y "%PROJECT_ROOT%\requirements.txt" "%STAGING%\" >nul

:: Carpetas principales (excluyendo __pycache__)
robocopy "%PROJECT_ROOT%\frontend" "%STAGING%\frontend" /E /XD __pycache__ /NFL /NDL /NJH /NJS
echo   frontend/ copiado.

robocopy "%PROJECT_ROOT%\backend" "%STAGING%\backend" /E /XD __pycache__ /NFL /NDL /NJH /NJS
echo   backend/ copiado.

robocopy "%PROJECT_ROOT%\bridge" "%STAGING%\bridge" /E /XD __pycache__ /NFL /NDL /NJH /NJS
echo   bridge/ copiado.

robocopy "%PROJECT_ROOT%\local-server" "%STAGING%\local-server" /E /XD __pycache__ node_modules /NFL /NDL /NJH /NJS
echo   local-server/ copiado.

robocopy "%PROJECT_ROOT%\assets" "%STAGING%\assets" /E /NFL /NDL /NJH /NJS
echo   assets/ copiado.

:: Carpetas vacias que la app espera
mkdir "%STAGING%\csd" 2>nul
mkdir "%STAGING%\deposito_doctos" 2>nul
mkdir "%STAGING%\facturas_timbradas" 2>nul

:: Config default vacio (no incluir secrets del repo)
if exist "%~dp0config_instituto_default.json" (
    copy /Y "%~dp0config_instituto_default.json" "%STAGING%\config_instituto.json" >nul
) else (
    echo {^} > "%STAGING%\config_instituto.json"
)

:: .env vacio
if not exist "%STAGING%\.env" (
    type nul > "%STAGING%\.env"
)

:: Generar app.ico desde logo.png usando Pillow (ya instalado)
echo   Generando icono de aplicacion...
"%STAGING%\python\python.exe" -c "from PIL import Image; img=Image.open(r'%STAGING%\assets\logo.png'); img.save(r'%STAGING%\assets\app.ico',format='ICO',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])"
if errorlevel 1 (
    echo   ADVERTENCIA: No se pudo generar app.ico. Los accesos directos usaran icono por defecto.
)

:: ---------------------------------------------------------------------------
:: 8. Compilar instalador con Inno Setup
:: ---------------------------------------------------------------------------
echo [8/8] Compilando instalador .exe...
"%ISCC%" "%ISS_FILE%"
if errorlevel 1 (
    echo ERROR: Fallo la compilacion del instalador.
    pause
    exit /b 1
)

:: Copiar resultado a raiz del proyecto
copy /Y "%~dp0Output\SSEPI-COI-Setup.exe" "%PROJECT_ROOT%\SSEPI-COI-Setup.exe" >nul

echo =========================================
echo INSTALADOR GENERADO CORRECTAMENTE
echo =========================================
echo Archivo: %PROJECT_ROOT%\SSEPI-COI-Setup.exe
echo.
pause
exit /b 0
