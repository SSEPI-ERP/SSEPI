param(
    [Parameter(Mandatory = $false)]
    [string] $FacturamaUser,
    [Parameter(Mandatory = $false)]
    [string] $FacturamaPassword,
    [Parameter(Mandatory = $false)]
    [ValidateSet("sandbox","prod","production","produccion","producción")]
    [string] $FacturamaEnv = "sandbox",
    [Parameter(Mandatory = $false)]
    [string] $FacturamaIssuerRfc,
    [Parameter(Mandatory = $false)]
    [string] $FacturamaIssuerName,
    [Parameter(Mandatory = $false)]
    [string] $FacturamaIssuerRegime = "601",
    [Parameter(Mandatory = $false)]
    [string] $FacturamaExpeditionZip = "45079",
    [Parameter(Mandatory = $false)]
    [string] $FacturapiApiKey
)

Write-Host "Configurando variables de entorno para Facturama / Facturapi..." -ForegroundColor Cyan

if ($PSBoundParameters.ContainsKey('FacturamaUser')) {
    $env:FACTURAMA_USER = $FacturamaUser
    Write-Host "FACTURAMA_USER establecido en la sesión actual"
}
if ($PSBoundParameters.ContainsKey('FacturamaPassword')) {
    $env:FACTURAMA_PASSWORD = $FacturamaPassword
    Write-Host "FACTURAMA_PASSWORD establecido en la sesión actual"
}
if ($PSBoundParameters.ContainsKey('FacturamaEnv')) {
    $env:FACTURAMA_ENV = $FacturamaEnv
    Write-Host "FACTURAMA_ENV = $FacturamaEnv"
}
if ($PSBoundParameters.ContainsKey('FacturamaIssuerRfc')) {
    $env:FACTURAMA_ISSUER_RFC = $FacturamaIssuerRfc
    Write-Host "FACTURAMA_ISSUER_RFC establecido"
}
if ($PSBoundParameters.ContainsKey('FacturamaIssuerName')) {
    $env:FACTURAMA_ISSUER_NAME = $FacturamaIssuerName
    Write-Host "FACTURAMA_ISSUER_NAME establecido"
}
$env:FACTURAMA_ISSUER_REGIME = $FacturamaIssuerRegime
$env:FACTURAMA_EXPEDITION_ZIP = $FacturamaExpeditionZip
Write-Host "FACTURAMA_ISSUER_REGIME = $FacturamaIssuerRegime"
Write-Host "FACTURAMA_EXPEDITION_ZIP = $FacturamaExpeditionZip"
if ($PSBoundParameters.ContainsKey('FacturapiApiKey')) {
    $env:FACTURAPI_API_KEY = $FacturapiApiKey
    Write-Host "FACTURAPI_API_KEY establecido en la sesión actual"
}

Write-Host "Listo. Variables activas en esta sesión de PowerShell." -ForegroundColor Green
Write-Host "Pruebas sugeridas:" -ForegroundColor Yellow
Write-Host "  python .\test_conexion.py"
Write-Host "  python .\test_facturama_timbrado.py"
Write-Host "  python .\test_timbrado.py (Facturapi)"
