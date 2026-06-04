# SSEPI - Cloudflare Quick Tunnel (trycloudflare.com)
# La URL es TEMPORAL: cada reinicio genera una nueva. No reutilices URLs viejas.

param(
    [switch]$SinAbrirChrome
)

# Forzar salida UTF-8 para que los guiones/em-dash no salgan como â€ en CMD cp1252
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$LocalPort = 3333
$LocalUrl = "http://localhost:$LocalPort"
$LoginPath = '/panel/login.html'

$CF = $null
foreach ($p in @(
    'C:\Program Files (x86)\cloudflared\cloudflared.exe',
    'C:\Program Files\cloudflared\cloudflared.exe',
    "$env:LOCALAPPDATA\cloudflared\cloudflared.exe",
    (Get-Command cloudflared.exe -ErrorAction SilentlyContinue).Source
)) {
    if ($p -and (Test-Path $p)) { $CF = $p; break }
}
if (-not $CF) {
    Write-Host 'ERROR: No se encontro cloudflared.exe' -ForegroundColor Red
    Write-Host 'Descargalo: https://github.com/cloudflare/cloudflared/releases'
    exit 1
}

Write-Host "[TUNEL] cloudflared: $CF" -ForegroundColor Cyan

function Test-SsepiServer {
    foreach ($base in @("http://127.0.0.1:$LocalPort", $LocalUrl)) {
        try {
            $null = Invoke-WebRequest -Uri "$base/api/health" -TimeoutSec 3 -UseBasicParsing
            return $true
        } catch { }
    }
    try {
        & curl.exe -s -f -m 3 "$LocalUrl/api/health" 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

function Test-PortListening([int]$port) {
    try {
        $lines = netstat -ano | Select-String ":$port\s" | Select-String 'LISTENING'
        return [bool]$lines
    } catch { return $false }
}

$serverOk = Test-SsepiServer
if (-not $serverOk) {
    $puertoOcupado = (Test-PortListening $LocalPort) -or (Test-PortListening 3443)
    if ($puertoOcupado) {
        Write-Host "[TUNEL] Hay un proceso SSEPI en 3333/3443 (ventana SSEPI SERVER)." -ForegroundColor Yellow
        Write-Host "        Esperando /api/health - NO arranques otro offline-server.mjs" -ForegroundColor Gray
    } else {
        Write-Host "[TUNEL] Servidor no detectado - arrancando offline-server..." -ForegroundColor Yellow
        Start-Process -FilePath 'cmd.exe' `
            -ArgumentList '/k', 'title SSEPI SERVER && node offline-server.mjs' `
            -WorkingDirectory $PSScriptRoot `
            -WindowStyle Normal | Out-Null
    }
}

$serverOk = $false
for ($i = 0; $i -lt 45; $i++) {
    if (Test-SsepiServer) {
        $serverOk = $true
        break
    }
    if ($i -eq 0) {
        Write-Host "[TUNEL] Esperando servidor en localhost:$LocalPort ..." -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 2
}
if (-not $serverOk) {
    Write-Host "ERROR: localhost:$LocalPort no responde tras 90s." -ForegroundColor Red
    Write-Host ""
    Write-Host "Que hacer:" -ForegroundColor Yellow
    Write-Host "  1. Cierra ventanas SSEPI SERVER / Cloudflare Tunnel duplicadas"
    Write-Host "  2. Ejecuta UNA vez: reiniciar-ssepi.bat  (mata node y levanta todo)"
    Write-Host "  3. NO ejecutes node offline-server.mjs a mano si ya hay una ventana SSEPI SERVER"
    Write-Host ""
    exit 1
}
Write-Host "[TUNEL] Servidor local OK" -ForegroundColor Green

$repoRoot = Split-Path $PSScriptRoot -Parent
$logDir = Join-Path $repoRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$lastUrlFile = Join-Path $logDir 'ultima-url-tunel.txt'
$urlActivaFile = Join-Path $PSScriptRoot 'URL-TUNEL-ACTIVA.txt'

$urlPattern = '(https://[a-z0-9][a-z0-9\-]*\.trycloudflare\.com)'
$tunnelUrl = $null

Write-Host '[TUNEL] Conectando a Cloudflare...' -ForegroundColor Cyan

$job = Start-Job -ScriptBlock {
    param($cf, $url)
    & $cf tunnel --url $url 2>&1
} -ArgumentList $CF, $LocalUrl

$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline -and -not $tunnelUrl) {
    $lines = Receive-Job -Job $job -ErrorAction SilentlyContinue
    foreach ($line in @($lines)) {
        if (-not $line) { continue }
        $text = $line.ToString()
        Write-Host $text -ForegroundColor DarkGray
        if ($text -match $urlPattern) {
            $tunnelUrl = $matches[1]
            break
        }
    }
    $st = (Get-Job -Id $job.Id).State
    if ($st -eq 'Failed' -or $st -eq 'Completed') { break }
    Start-Sleep -Seconds 1
}

if (-not $tunnelUrl) {
    Write-Host '[TUNEL] No se obtuvo URL en 90s.' -ForegroundColor Red
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    exit 1
}

$loginUrl = "$tunnelUrl$LoginPath"
Write-Host ''
Write-Host '=========================================' -ForegroundColor Green
Write-Host '  TUNEL ACTIVO - NO CIERRES ESTA VENTANA' -ForegroundColor Green
Write-Host ''
Write-Host "  URL: $tunnelUrl" -ForegroundColor Yellow
Write-Host "  Login: $loginUrl" -ForegroundColor Yellow
Write-Host ''
Write-Host '  Las URLs trycloudflare CADUCAN al cerrar el tunel.' -ForegroundColor Gray
Write-Host '  No uses enlaces viejos (extended-usa-dragon-...).' -ForegroundColor Gray
Write-Host '=========================================' -ForegroundColor Green
Write-Host ''

$tunnelUrl | Out-File -FilePath $lastUrlFile -Encoding utf8 -Force
@"
TUNEL ACTIVO - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
URL: $tunnelUrl
Login: $loginUrl
"@ | Out-File -FilePath $urlActivaFile -Encoding ascii -Force

try {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    [System.Windows.Forms.Clipboard]::SetText($loginUrl)
    Write-Host '[TUNEL] Login copiado al portapapeles.' -ForegroundColor Gray
} catch { }

if (-not $SinAbrirChrome) {
    Start-Process 'chrome' $loginUrl
}

Write-Host 'Mantén esta ventana abierta. Ciérrala solo cuando termines.' -ForegroundColor Yellow
Write-Host ''

try {
    Wait-Job -Job $job | Out-Null
} finally {
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
}

Write-Host '[TUNEL] Tunel cerrado - la URL ya no funciona.' -ForegroundColor Red
