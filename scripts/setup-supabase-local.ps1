# =====================================================
# SSEPI — Setup Supabase Local (Windows PowerShell)
# Ejecutar como Administrador en PowerShell
# =====================================================

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " SSEPI SETUP LOCAL — Supabase + Docker " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1) Verificar Docker
Write-Host "`n[1/8] Verificando Docker..." -ForegroundColor Yellow
try {
    $dockerVer = docker --version
    Write-Host "Docker OK: $dockerVer" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Docker no esta instalado. Instala Docker Desktop primero:" -ForegroundColor Red
    Write-Host "https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
    exit 1
}

# 2) Instalar scoop (si no existe)
Write-Host "`n[2/8] Verificando scoop..." -ForegroundColor Yellow
if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
    Write-Host "Instalando scoop..." -ForegroundColor Yellow
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
} else {
    Write-Host "scoop ya instalado" -ForegroundColor Green
}

# 3) Instalar Supabase CLI
Write-Host "`n[3/8] Instalando Supabase CLI..." -ForegroundColor Yellow
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    scoop bucket add supabase https://github.com/supabase/scoop.git
    scoop install supabase
} else {
    Write-Host "Supabase CLI ya instalado" -ForegroundColor Green
}

# 4) Ir al proyecto
$projectPath = "E:\SSEPI"
Set-Location $projectPath
Write-Host "`n[4/8] Proyecto: $projectPath" -ForegroundColor Green

# 5) Inicializar supabase (si no existe carpeta supabase/)
Write-Host "`n[5/8] Inicializando Supabase local..." -ForegroundColor Yellow
if (-not (Test-Path "$projectPath\supabase\config.toml")) {
    supabase init
} else {
    Write-Host "Ya inicializado (config.toml existe)" -ForegroundColor Green
}

# 6) Linkear proyecto remoto
Write-Host "`n[6/8] Linkeando proyecto remoto knzmdwjmrhcoytmebdwa..." -ForegroundColor Yellow
supabase link --project-ref knzmdwjmrhcoytmebdwa

# 7) Pull del schema remoto
Write-Host "`n[7/8] Descargando schema remoto..." -ForegroundColor Yellow
supabase db pull

# 8) Arrancar Supabase local
Write-Host "`n[8/8] Levantando Supabase local..." -ForegroundColor Yellow
Write-Host "(Esto puede tardar 2-3 min la primera vez)" -ForegroundColor DarkGray
supabase start

# 9) Extraer claves y guardar en .env.local
Write-Host "`n[9/8] Extrayendo claves..." -ForegroundColor Yellow
$status = supabase status --output json | ConvertFrom-Json
$anonKey = $status.ANON_KEY
$serviceKey = $status.SERVICE_ROLE_KEY
$apiUrl = $status.API_URL

Write-Host "`n=== CLAVES LOCALES ===" -ForegroundColor Green
Write-Host "API URL: $apiUrl"
Write-Host "ANON KEY: $anonKey"
Write-Host "SERVICE ROLE: $serviceKey"

# Guardar en ssepinext/.env.local
$envContent = @"
# SSEPI-NEXT Configuracion Local
SUPABASE_URL=$apiUrl
SUPABASE_ANON_KEY=$anonKey
SUPABASE_SERVICE_ROLE_KEY=$serviceKey
PORT=3333
COI_BRIDGE_URL=http://localhost:8765
"@
$envContent | Set-Content -Path "$projectPath\ssepinext\.env.local" -Encoding UTF8
Write-Host "`nGuardado en ssepinext/.env.local" -ForegroundColor Green

# Actualizar supabase-config.js con el anon key local
$supaConfigPath = "$projectPath\panel\js\core\supabase-config.js"
$supaContent = Get-Content $supaConfigPath -Raw
$supaContent = $supaContent -replace "REPLACE_WITH_SUPABASE_STATUS_ANON_KEY", $anonKey
Set-Content -Path $supaConfigPath -Value $supaContent -Encoding UTF8
Write-Host "Actualizado panel/js/core/supabase-config.js con anon key local" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " SUPABASE LOCAL LISTO " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Studio:     http://localhost:54323" -ForegroundColor White
Write-Host "API:        http://localhost:54321" -ForegroundColor White
Write-Host "SSEPI ERP:  http://localhost:3333/panel/panel.html" -ForegroundColor White
Write-Host "`nPara levantar el servidor Express, ejecuta:" -ForegroundColor Yellow
Write-Host "  cd E:\SSEPI\ssepinext" -ForegroundColor Cyan
Write-Host "  npm install" -ForegroundColor Cyan
Write-Host "  npm run local" -ForegroundColor Cyan
