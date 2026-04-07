# -*- coding: utf-8 -*-
"""Ventanas locales 08:00 y 14:00 para sincronización automática de tipos de cambio."""
from __future__ import annotations

from datetime import datetime, timedelta, time
from typing import Optional


def proxima_sincronizacion_tipos_cambio(now: Optional[datetime] = None) -> datetime:
    """
    Siguiente disparo local a las 08:00 o 14:00 (mismo día o mañana 08:00).
    """
    now = now or datetime.now()
    today = now.date()
    t8 = datetime.combine(today, time(8, 0, 0))
    t14 = datetime.combine(today, time(14, 0, 0))
    if now < t8:
        return t8
    if now < t14:
        return t14
    return t8 + timedelta(days=1)


def ms_hasta_proxima_sync() -> int:
    """Milisegundos hasta la próxima ventana 08:00/14:00 (mínimo 1 s)."""
    nxt = proxima_sincronizacion_tipos_cambio()
    delta = (nxt - datetime.now()).total_seconds()
    return max(1000, int(delta * 1000))


def formatear_restante_hasta(objetivo: datetime) -> str:
    """Texto tipo 'en 2h 15m' o 'en 45 min'."""
    seg = (objetivo - datetime.now()).total_seconds()
    if seg <= 0:
        return "ahora"
    if seg < 90:
        return f"en {int(seg)} s"
    m = int(seg // 60)
    if m < 60:
        return f"en {m} min"
    h = m // 60
    mm = m % 60
    if h >= 24:
        d = int(seg // 86400)
        return f"en {d} día(s)"
    return f"en {h}h {mm:02d}m"


def etiqueta_horarios_sync_modulo_monedas() -> str:
    """Solo para el módulo Monedas (no usar en la barra global de la ventana)."""
    return (
        "Sincronización automática con referencia de mercado (Banxico cuando aplica + Frankfurter/ECB): "
        "08:00 y 14:00, hora local."
    )
