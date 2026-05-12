# SSEPI - Cloudflare Tunnel (PowerShell)
# Inicia tunel y abre Chrome automaticamente con la URL publica

$CF = $null

# Buscar cloudflared.exe
$possiblePaths = @(
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    "C:\Program Files\cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\cloudflared\cloudflared.exe",
    (Get-Command cloudflared.exe -ErrorAction SilentlyContinue).Source
)

foreach ($p in $possiblePaths) {
    if ($p -and (Test-Path $p)) {
        $CF = $p
        break
    }
}

if (-not $CF) {
    Write-Host "ERROR: No se encontro cloudflared.exe" -ForegroundColor Red
    Write-Host "Descargalo desde: https://github.com/cloudflare/cloudflared/releases"
    pause
    exit 1
}

Write-Host "[TUNEL] cloudflared encontrado: $CF" -ForegroundColor Cyan

# Archivos de log
$outFile = "$env:TEMP\ssepi-tunnel-out.log"
$errFile = "$env:TEMP\ssepi-tunnel-err.log"
if (Test-Path $outFile) { Remove-Item $outFile -Force }
if (Test-Path $errFile) { Remove-Item $errFile -Force }

# Verificar servidor local
try {
    $null = Invoke-RestMethod -Uri "http://localhost:3333/api/health" -TimeoutSec 5
    Write-Host "[TUNEL] Servidor local OK" -ForegroundColor Green
} catch {
    Write-Host "AVISO: localhost:3333 no responde. Asegurate de correr reiniciar-ssepi.bat primero." -ForegroundColor Yellow
}

Write-Host "[TUNEL] Conectando a Cloudflare..." -ForegroundColor Cyan
Write-Host "[TUNEL] Espera ~15 segundos..." -ForegroundColor Cyan

# Iniciar cloudflared en background redirigiendo output a archivos
$proc = Start-Process -FilePath $CF `
    -ArgumentList "tunnel","--url","http://localhost:3333" `
    -RedirectStandardOutput $outFile `
    -RedirectStandardError $errFile `
    -WindowStyle Hidden -PassThru

# Esperar a que genere la URL
Start-Sleep -Seconds 15

# Leer logs y parsear URL
$output = ""
if (Test-Path $outFile) {
    $output += Get-Content $outFile -Raw -ErrorAction SilentlyContinue
}
if (Test-Path $errFile) {
    $output += Get-Content $errFile -Raw -ErrorAction SilentlyContinue
}

if ($output -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
    $tunnelUrl = $matches[1]
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host "  TUNEL ACTIVO" -ForegroundColor Green
    Write-Host ""
    Write-Host "  URL PUBLICA:" -ForegroundColor White
    Write-Host "    $tunnelUrl" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Esta URL es temporal." -ForegroundColor Gray
    Write-Host "  Cada vez que reinicies el tunel cambia." -ForegroundColor Gray
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host ""

    # Abrir Chrome
    $chromeUrl = "$tunnelUrl/panel/login.html"
    Write-Host "[TUNEL] Abriendo Chrome..." -ForegroundColor Cyan
    Start-Process "chrome" $chromeUrl

    Write-Host "[TUNEL] Chrome abierto. Tunel corriendo en segundo plano." -ForegroundColor Green
    Write-Host ""
    Write-Host "NOTA: Todo lo que guardes se guarda en tu base local." -ForegroundColor Gray
    Write-Host ""
    pause
} else {
    Write-Host "[TUNEL] No se pudo obtener la URL automaticamente." -ForegroundColor Red
    Write-Host "Revisa los logs en:" -ForegroundColor Yellow
    Write-Host "  $outFile" -ForegroundColor Yellow
    Write-Host "  $errFile" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Contenido del log:" -ForegroundColor Gray
    Write-Host $output -ForegroundColor Gray
    pause
}

# Cuando el usuario presione una tecla, matar el proceso
Write-Host "[TUNEL] Cerrando tunel..." -ForegroundColor Cyan
if (-not $proc.HasExited) { $proc.Kill() }
