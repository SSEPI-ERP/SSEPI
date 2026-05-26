#!/usr/bin/env python3
"""
Prueba de lectura del formato laboratorio-1 (importación de reportes).

Uso:
    python prueba_lectura_formato.py
    python prueba_lectura_formato.py datos_ordenes_editables.json
"""
import json
import sys
from pathlib import Path

from formato_laboratorio import FORMATO_VERSION, migrar_desde_legacy, validar_orden

BASE = Path(__file__).resolve().parent
DEFAULT_FILES = [
    BASE / "datos_reportes.json",
    BASE / "datos_ordenes_editables.json",
]


def probar_archivo(path: Path) -> dict:
    if not path.exists():
        return {"archivo": str(path), "error": "no existe", "ok": 0, "fail": 0}

    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        data = [data]

    ok, fail, muestras = 0, 0, []
    for raw in data:
        orden = migrar_desde_legacy(raw)
        errs = validar_orden(orden)
        if errs:
            fail += 1
            if len(muestras) < 3:
                muestras.append(
                    {
                        "ref": orden.get("referencia_reparacion"),
                        "errores": errs,
                    }
                )
        else:
            ok += 1

    ejemplo = None
    if data:
        ejemplo = migrar_desde_legacy(data[0])
        ejemplo_out = {
            k: ejemplo[k]
            for k in (
                "formato",
                "referencia_reparacion",
                "numero_orden_wh",
                "etapa_actual",
                "datos_recepcion",
                "resumen_diagnostico",
                "imagenes_reporte",
                "componentes_extras",
                "componentes_inventario",
                "componentes_compra",
            )
            if k in ejemplo
        }
        ejemplo_out["etapas_resumen"] = [
            f"{e['n']}. {e['nombre']} ({e['estado']})" for e in (ejemplo.get("etapas") or [])
        ]
    else:
        ejemplo_out = None

    return {
        "archivo": path.name,
        "total": len(data),
        "ok": ok,
        "fail": fail,
        "formato": FORMATO_VERSION,
        "ejemplo": ejemplo_out,
        "errores_muestra": muestras,
    }


def main():
    paths = [Path(p) for p in sys.argv[1:]] if len(sys.argv) > 1 else DEFAULT_FILES
    print(f"=== Prueba lectura formato {FORMATO_VERSION} ===\n")
    for path in paths:
        r = probar_archivo(path)
        print(f"Archivo: {r.get('archivo', path)}")
        if r.get("error"):
            print(f"  {r['error']}\n")
            continue
        print(f"  Registros: {r['total']}")
        print(f"  Válidos:   {r['ok']}")
        print(f"  Inválidos: {r['fail']}")
        if r.get("ejemplo"):
            print("  Ejemplo (1er registro):")
            print(json.dumps(r["ejemplo"], ensure_ascii=False, indent=4))
        if r.get("errores_muestra"):
            print("  Errores (muestra):")
            print(json.dumps(r["errores_muestra"], ensure_ascii=False, indent=4))
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
