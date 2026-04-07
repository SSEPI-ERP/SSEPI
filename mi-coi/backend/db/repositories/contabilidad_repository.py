from __future__ import annotations

from typing import Any, Dict, List

from backend.db.sqlserver_connection import get_db_engine
from backend.models.polizas import SistemaPolizas


class ContabilidadRepository:
    """
    Repositorio de alto nivel para operaciones núcleo.

    Actualmente delega al motor existente y deja listo el punto de extensión
    para SQL Server sin acoplar la UI al motor físico de BD.
    """

    def __init__(self, db_path: str | None = None):
        self.engine = get_db_engine()
        self.polizas = SistemaPolizas(db_path=db_path)

    def crear_poliza(self, tipo: str, fecha: str, concepto: str, movimientos: List[Dict[str, Any]], **kw) -> Dict[str, Any]:
        return self.polizas.crear_poliza(tipo, fecha, concepto, movimientos, **kw)

    def verificar_poliza(self, poliza_id: int) -> Dict[str, Any]:
        return self.polizas.verificar_poliza(poliza_id)

    def afectar_poliza(self, poliza_id: int, *, usuario_afectacion: str | None = None) -> Dict[str, Any]:
        return self.polizas.afectar_poliza(poliza_id, usuario_afectacion=usuario_afectacion)

    def desafectar_poliza(self, poliza_id: int, **kw) -> Dict[str, Any]:
        return self.polizas.desafectar_poliza(poliza_id, **kw)

    def cancelar_poliza(self, poliza_id: int, motivo: str = "", **kw) -> Dict[str, Any]:
        return self.polizas.cancelar_poliza(poliza_id, motivo=motivo, **kw)

    def duplicar_poliza(self, poliza_id: int, **kw) -> Dict[str, Any]:
        return self.polizas.duplicar_poliza(poliza_id, **kw)

    def vincular_cfdi_partida(self, id_partida: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self.polizas.vincular_cfdi_partida(id_partida, payload)

