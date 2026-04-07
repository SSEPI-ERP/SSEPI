# Verificación automática (sin GUI): libro diario + CFDI, integrado, export PDF, motor EF.
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def main() -> int:
    from backend.modules.libro_contable import LibroContableManager
    from backend.modules.export_estados_libros import export_libro_diario_pdf
    from backend.modules.estados_financieros_motor import EstadosFinancierosMotor

    m = LibroContableManager()
    r = m.libro_diario("2000-01-01", "2099-12-31")
    assert r.get("exito"), r.get("error", r)
    fuente = r.get("fuente")
    lineas_checked = 0
    for p in r.get("polizas") or []:
        for ln in p.get("lineas") or []:
            assert "uuid" in ln, ln
            assert "cfdi" in ln, ln
            assert isinstance(ln.get("cfdi"), dict), ln
            lineas_checked += 1
    print(f"libro_diario: fuente={fuente} polizas={len(r.get('polizas') or [])} lineas={lineas_checked}")

    if fuente == "partidas_poliza" and lineas_checked == 0:
        print("  (aviso) Sin partidas en el rango; estructura uuid/cfdi no probada en datos reales.")

    fd, pdf_path = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)
    try:
        ex = export_libro_diario_pdf(r, pdf_path, empresa="Verificación SA de CV")
        assert ex.get("exito"), ex
        assert os.path.getsize(pdf_path) > 80, "PDF vacío o corrupto"
        print("export_libro_diario_pdf: OK")
    finally:
        try:
            os.unlink(pdf_path)
        except OSError:
            pass

    r2 = m.diario_mayor_integrado("2000-01-01", "2099-12-31")
    assert r2.get("exito"), r2
    for p in (r2.get("polizas") or [])[:20]:
        assert "resumen_por_cuenta" in p
        assert "lineas" in p
    print("diario_mayor_integrado: OK")

    ef = EstadosFinancierosMotor()
    er = ef.estado_resultados_mensual(1, 2026)
    assert isinstance(er, dict) and er.get("exito") is not False, er
    print("EstadosFinancierosMotor.estado_resultados_mensual: OK")

    bg = ef.balance_general_detallado("2026-12-31")
    assert isinstance(bg, dict) and bg.get("exito"), bg
    print("EstadosFinancierosMotor.balance_general_detallado: OK")

    print("\nTodas las verificaciones pasaron.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
