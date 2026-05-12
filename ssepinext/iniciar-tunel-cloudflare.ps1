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

# Limpiar log anterior
$logFile = "$env:TEMP\ssepi-tunnel.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

# Verificar servidor local
try {
    $null = Invoke-RestMethod -Uri "http://localhost:3333/api/health" -TimeoutSec 5
    Write-Host "[TUNEL] Servidor local OK" -ForegroundColor Green
} catch {
    Write-Host "AVISO: localhost:3333 no responde. Asegurate de correr reiniciar-ssepi.bat primero." -ForegroundColor Yellow
}

Write-Host "[TUNEL] Conectando a Cloudflare..." -ForegroundColor Cyan
Write-Host "[TUNEL] Espera ~15 segundos..." -ForegroundColor Cyan

# Iniciar cloudflared en background
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $CF
$psi.Arguments = "tunnel","--url","http://localhost:3333"
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden

$proc = [System.Diagnostics.Process]::Start($psi)

# Esperar a que genere la URL
Start-Sleep -Seconds 15

# Leer log y parsear URL
$output = ""
if ($proc.StandardOutput -and -not $proc.StandardOutput.EndOfStream) {
    $output = $proc.StandardOutput.ReadToEnd()
}
$output += Get-Content $logFile -Raw -ErrorAction SilentlyContinue

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
    Write-Host "Revisa el log en: $logFile" -ForegroundColor Yellow
    pause
}

# Cuando el usuario presione una tecla, matar el proceso
Write-Host "[TUNEL] Cerrando tunel..." -ForegroundColor Cyan
if (-not $proc.HasExited) { $proc.Kill() }
