# =====================================================
# SSEPI NEXT — Levantar servidor local Express
# =====================================================

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " SSEPI NEXT — Servidor Local " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Set-Location "E:\SSEPI\ssepinext"

# Verificar node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias..." -ForegroundColor Yellow
    npm install
}

Write-Host "`nLevantando servidor en http://localhost:3333 ..." -ForegroundColor Green
Write-Host "ERP:      http://localhost:3333/panel/panel.html" -ForegroundColor White
Write-Host "COI API:  http://localhost:3333/api/coi/*" -ForegroundColor White
Write-Host "Health:   http://localhost:3333/api/health" -ForegroundColor White
Write-Host "`nPresiona Ctrl+C para detener" -ForegroundColor DarkGray

npm run local
