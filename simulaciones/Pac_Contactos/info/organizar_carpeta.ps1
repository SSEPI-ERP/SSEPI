# Mueve archivos no necesarios a "no usar"
$root = $PSScriptRoot
$archivo = Join-Path $root "no usar"
New-Item -ItemType Directory -Force -Path $archivo | Out-Null

$mover = @(
    ".claude",
    "node_modules",
    "debug_angiui.py",
    "debug_merge.py",
    "debug_normalization.py",
    "extract_clients.py",
    "merge_client_lists.py",
    "merge_client_lists_correct.py",
    "merge_client_lists_final.py",
    "merge_client_lists_v2.py",
    "merge_client_lists_v3.py",
    "process_images.js",
    "process_images_v2.js",
    "clients_final.json",
    "clients_from_excel.json",
    "clients_merged.json",
    "comparacion_clientes.html",
    "odoo_excel_matcher.html",
    "lector_contactos_odoo.html",
    "IMPLEMENTATION_SUMMARY.md",
    "eng.traineddata",
    "spa.traineddata",
    "package.json",
    "package-lock.json"
)

foreach ($item in $mover) {
    $src = Join-Path $root $item
    if (Test-Path $src) {
        $dst = Join-Path $archivo $item
        if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
        Move-Item $src $dst -Force
        Write-Host "Movido: $item"
    }
}

# Limpiar SistemaContactos (dejar solo CapturasOdoo con imagenes)
$sc = Join-Path $root "SistemaContactos"
if (Test-Path $sc) {
    Get-ChildItem $sc -File | ForEach-Object {
        Move-Item $_.FullName (Join-Path $archivo "SistemaContactos_$($_.Name)") -Force
        Write-Host "Movido SC: $($_.Name)"
    }
    $cap = Join-Path $sc "CapturasOdoo"
    if (Test-Path $cap) {
        Get-ChildItem $cap -File | Where-Object { $_.Extension -ne ".png" } | ForEach-Object {
            Move-Item $_.FullName (Join-Path $archivo "CapturasOdoo_$($_.Name)") -Force
            Write-Host "Movido cap: $($_.Name)"
        }
        if (Test-Path (Join-Path $cap "_tmp_ocr")) {
            Move-Item (Join-Path $cap "_tmp_ocr") (Join-Path $archivo "CapturasOdoo_tmp_ocr") -Force
        }
    }
    if (Test-Path (Join-Path $sc "TabuladoresExcel")) {
        Move-Item (Join-Path $sc "TabuladoresExcel") (Join-Path $archivo "TabuladoresExcel") -Force
    }
}

Write-Host "`nListo. En la raiz quedan:"
Get-ChildItem $root -Name | Sort-Object
