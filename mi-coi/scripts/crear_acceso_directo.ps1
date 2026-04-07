# Crea un acceso directo en el Escritorio para SSEPI COI (Python + main.py).
# Uso: clic derecho → Ejecutar con PowerShell, o desde PowerShell:
#   cd D:\SSEPI\mi-coi\scripts
#   .\crear_acceso_directo.ps1
# Opcional: icono propio en mi-coi\assets\app.ico

$Root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $Root "main.py"))) {
    Write-Host "No se encontro main.py junto a mi-coi. Ejecuta desde mi-coi\scripts" -ForegroundColor Red
    exit 1
}

$launcher = Join-Path $Root "SSEPI COI.vbs"
if (-not (Test-Path $launcher)) {
    Write-Host "No se encontro SSEPI COI.vbs en mi-coi" -ForegroundColor Red
    exit 1
}

$iconPath = Join-Path $Root "assets\app.ico"
if (-not (Test-Path $iconPath)) {
    $iconPath = Join-Path $env:SystemRoot "System32\wscript.exe"
}

$Wsh = New-Object -ComObject WScript.Shell
$desk = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desk "SSEPI COI.lnk"
$sc = $Wsh.CreateShortcut($lnkPath)
$sc.TargetPath = $launcher
$sc.Arguments = ""
$sc.WorkingDirectory = $Root
$sc.WindowStyle = 7
$sc.Description = "SSEPI COI v1 - Sin ventana de consola"
$sc.IconLocation = $iconPath
$sc.Save()

Write-Host "Listo: $lnkPath" -ForegroundColor Green
Write-Host "Doble clic abre el COI sin CMD. Tambien puedes usar: $launcher" -ForegroundColor Cyan
Write-Host "Icono opcional: $(Join-Path $Root 'assets\app.ico')" -ForegroundColor Cyan
