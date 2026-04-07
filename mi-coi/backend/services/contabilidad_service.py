from __future__ import annotations

from typing import Any, Dict, List

from backend.db.repositories.contabilidad_repository import ContabilidadRepository


class ContabilidadService:
    """Servicio de aplicación para reglas contables de fase 1."""

    def __init__(self, db_path: str | None = None):
        self.repo = ContabilidadRepository(db_path=db_path)

    def crear_poliza_y_afectar(
        self,
        tipo: str,
        fecha: str,
        concepto: str,
        movimientos: List[Dict[str, Any]],
        *,
        moneda: str = "MXN",
        tipo_cambio: float = 1.0,
    ) -> Dict[str, Any]:
        r = self.repo.crear_poliza(
            tipo,
            fecha,
            concepto,
            movimientos,
            moneda=moneda,
            tipo_cambio=tipo_cambio,
            estatus="V",
        )
        if not r.get("exito"):
            return r
        pid = int(r["poliza_id"])
        rv = self.repo.verificar_poliza(pid)
        if not rv.get("exito"):
            return rv
        ra = self.repo.afectar_poliza(pid, usuario_afectacion=None)
        if not ra.get("exito"):
            return ra
        return {"exito": True, "poliza_id": pid, "numero_poliza": r.get("numero_poliza")}

    def afectar_poliza(self, poliza_id: int, *, usuario_afectacion: str | None = None) -> Dict[str, Any]:
        rv = self.repo.verificar_poliza(poliza_id)
        if not rv.get("exito") and "ya está verificada" not in str(rv.get("mensaje", "")).lower():
            return rv
        return self.repo.afectar_poliza(poliza_id, usuario_afectacion=usuario_afectacion)

    def desafectar_poliza(
        self,
        poliza_id: int,
        *,
        supervisor_password: str = "",
        justificacion: str = "",
        usuario_operador: str | None = None,
    ) -> Dict[str, Any]:
        return self.repo.desafectar_poliza(
            poliza_id,
            supervisor_password=supervisor_password,
            justificacion=justificacion,
            usuario_operador=usuario_operador,
        )

    def verificar_poliza(self, poliza_id: int) -> Dict[str, Any]:
        return self.repo.verificar_poliza(poliza_id)

    def cancelar_poliza(
        self,
        poliza_id: int,
        motivo: str = "",
        *,
        usuario_operador: str | None = None,
    ) -> Dict[str, Any]:
        return self.repo.cancelar_poliza(poliza_id, motivo=motivo, usuario_operador=usuario_operador)

    def duplicar_poliza(self, poliza_id: int, *, fecha_nueva: str | None = None, **kw: Any) -> Dict[str, Any]:
        return self.repo.duplicar_poliza(poliza_id, fecha_nueva=fecha_nueva, estatus_nuevo="C", **kw)

