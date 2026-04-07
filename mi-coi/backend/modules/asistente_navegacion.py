"""
Asistente guiado: temas para contadores, búsqueda local por palabras clave y textos de ayuda.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


def _sin_acentos(s: str) -> str:
    s = (s or "").lower().strip()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def normalizar_consulta(texto: str) -> str:
    t = _sin_acentos(texto)
    t = re.sub(r"[^\w\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


ORDEN_CATEGORIAS: Tuple[str, ...] = (
    "Cuentas y captura",
    "Reportes y estados financieros",
    "Libros y auxiliares",
    "CFDI, fiscal y SAT",
    "Centros de costo y presupuesto",
    "Cierre, activos y multimoneda",
    "Administración y seguridad",
    "Interfaces y herramientas",
)


@dataclass(frozen=True)
class TemaAsistente:
    id: str
    titulo: str
    categoria: str
    keywords: Tuple[Tuple[str, int], ...]
    donde_esta: str
    pasos: Tuple[str, ...]
    accion: str


def _t(
    tid: str,
    titulo: str,
    categoria: str,
    kw: Tuple[Tuple[str, int], ...],
    donde: str,
    pasos: Tuple[str, ...],
    accion: Optional[str] = None,
) -> TemaAsistente:
    return TemaAsistente(
        id=tid,
        titulo=titulo,
        categoria=categoria,
        keywords=kw,
        donde_esta=donde,
        pasos=pasos,
        accion=accion or tid,
    )


# --- Temas (preguntas típicas de un contador que usa COI) ---
_C = "Cuentas y captura"
_R = "Reportes y estados financieros"
_L = "Libros y auxiliares"
_F = "CFDI, fiscal y SAT"
_P = "Centros de costo y presupuesto"
_X = "Cierre, activos y multimoneda"
_A = "Administración y seguridad"
_H = "Interfaces y herramientas"

TEMAS: Tuple[TemaAsistente, ...] = (
    _t(
        "catalogo",
        "Catálogo de cuentas",
        _C,
        (
            ("catalogo de cuentas", 24),
            ("plan de cuentas", 18),
            ("alta de cuenta", 12),
            ("cuentas contables", 12),
            ("catalogo", 10),
            ("cuenta contable", 10),
            ("rubro contable", 8),
        ),
        "Menú: Cuentas y pólizas → Cuentas. Atajo F2. Explorador: Cuentas y pólizas → Catálogo.",
        (
            "Abra el catálogo (F2).",
            "Filtre por rubro o naturaleza si trabaja con listas largas.",
            "Para altas: número de cuenta, nombre, naturaleza y, si aplica, centro de costo.",
            "Tras cambios masivos, use Actualizar en la barra y valide en balanza.",
        ),
    ),
    _t(
        "polizas",
        "Captura de pólizas",
        _C,
        (
            ("captura de polizas", 22),
            ("poliza contable", 16),
            ("polizas", 14),
            ("asiento contable", 14),
            ("registrar poliza", 12),
            ("diario contable", 10),
        ),
        "Menú: Pólizas → Captura de pólizas. Atajo F3.",
        (
            "Entre con F3; elija tipo de póliza según el hecho (ingresos, egresos, diario, etc.).",
            "Capture fecha, concepto y partidas (cargo/abono) cuadradas.",
            "Guarde; verifique saldos en balanza o auxiliar del mismo periodo.",
        ),
    ),
    _t(
        "polizas_ingresos",
        "Pólizas de ingresos",
        _C,
        (("polizas de ingresos", 24), ("poliza de ingreso", 18), ("ingresos", 8)),
        "Menú: Pólizas → Pólizas de ingresos.",
        ("Abra el módulo desde el menú.", "Capture como una póliza normal filtrada a tipo ingresos.", "Cuadre cargos y abonos antes de guardar."),
    ),
    _t(
        "polizas_egresos",
        "Pólizas de egresos",
        _C,
        (("polizas de egresos", 24), ("poliza de egreso", 18), ("egresos", 8)),
        "Menú: Pólizas → Pólizas de egresos.",
        ("Use este acceso para salidas de efectivo o pagos típicos.", "Revise bancos y proveedores contra auxiliares.", "Confirme IVA acreditable si aplica."),
    ),
    _t(
        "polizas_diario",
        "Pólizas de diario",
        _C,
        (("polizas de diario", 24), ("poliza de diario", 18), ("diario general", 10)),
        "Menú: Pólizas → Pólizas de diario.",
        ("Para ajustes y asientos no clasificados como ingreso/egreso.", "Documente el concepto para auditoría.", "Tras el cierre, evite reabrir periodos bloqueados sin autorización."),
    ),
    _t(
        "plantillas_poliza",
        "Pólizas plantilla / modelo",
        _C,
        (("polizas plantilla", 22), ("plantilla de poliza", 18), ("poliza modelo", 16), ("recurrente", 8)),
        "Menú: Pólizas → Polizas plantilla.",
        ("Defina modelos para asientos repetitivos (nómina, provisiones, etc.).", "Ajuste importes y cuentas al aplicar la plantilla.", "Revise siempre el resultado antes de definitivar."),
    ),
    _t(
        "conceptos_poliza",
        "Conceptos de póliza",
        _C,
        (("conceptos de poliza", 22), ("concepto poliza", 16), ("textos predefinidos", 8)),
        "Menú: Cuentas y pólizas → Conceptos de póliza.",
        ("Mantenga conceptos homogéneos para reportes y auditoría.", "Evite textos libres duplicados con distinta redacción.", "Coordine con el equipo qué conceptos son obligatorios."),
    ),
    _t(
        "clientes",
        "Clientes (RFC / auxiliares)",
        _C,
        (("catalogo de clientes", 18), ("clientes", 12), ("rfc cliente", 10), ("cuentas por cobrar cliente", 8)),
        "Menú: Cuentas y pólizas → Clientes.",
        ("Alta y mantenimiento de clientes vinculados a cuentas por cobrar.", "Útil para DIOT, auxiliares y facturación.", "Valide RFC contra comprobantes recibidos."),
    ),
    _t(
        "activos_fijos",
        "Activos fijos y depreciación",
        _C,
        (
            ("activos fijos", 20),
            ("depreciacion", 14),
            ("activo fijo", 12),
            ("bienes muebles", 8),
        ),
        "Explorador: Cuentas y pólizas → Activos fijos. Menú Procesos: Depreciación de activos (F7).",
        ("Registre altas y parámetros de vida útil/método según política.", "Ejecute depreciación mensual desde Procesos y cierre.", "Concilie con balanza y pólizas de gasto."),
    ),
    _t(
        "catalogo_sat_pdf",
        "Catálogo oficial SAT (PDF)",
        _C,
        (("catalogo sat", 18), ("catalogo del sat", 16), ("pdf sat cuentas", 10)),
        "Menú: Cuentas y pólizas → Cargar catálogo oficial SAT (PDF).",
        ("Use cuando deba alinear cuentas a códigos SAT de contabilidad electrónica.", "Revise mapeos después de importar.", "Respalde la BD antes de cambios masivos de catálogo."),
        "cargar_catalogo_sat",
    ),
    _t(
        "integridad_catalogo",
        "Integridad del catálogo",
        _C,
        (("integridad catalogo", 20), ("validar catalogo", 14), ("errores de cuentas", 10)),
        "Módulo Catálogo de cuentas: botón «Integridad» en la barra de acciones del área principal.",
        ("Ejecute la verificación desde el catálogo abierto.", "Corrija cuentas duplicadas, huecos o jerarquía inválida.", "Vuelva a generar balanza tras correcciones."),
    ),
    _t(
        "balanza",
        "Balanza de comprobación",
        _R,
        (
            ("balanza de comprobacion", 28),
            ("balanza comprobacion", 22),
            ("balanza", 18),
            ("comprobacion", 10),
            ("debe y haber", 10),
            ("cuadre", 8),
        ),
        "Menú: Reportes y estados → Balanza de comprobación. F4. Explorador: Reportes y estados → Balanza.",
        (
            "F4 o menú; elija mes, año, moneda y TC.",
            "Genere la balanza y revise totales de cargos y abonos.",
            "Use Verificar cuadre / Cuadre rápido si hay diferencias.",
            "Exporte a Excel o XML para SAT según necesite.",
        ),
    ),
    _t(
        "balanza_avanzada",
        "Balanza acumulada / comparativa / dos ejercicios",
        _R,
        (
            ("balanza acumulada", 22),
            ("balanza comparativa", 20),
            ("dos ejercicios", 16),
            ("balanza avanzada", 18),
        ),
        "Menú: Reportes y estados → Balanza acumulada / comparativa / dos ejercicios.",
        ("Defina periodos o ejercicios a comparar.", "Analice variaciones entre periodos.", "Ideal para dictámenes y revisiones anuales."),
    ),
    _t(
        "verificacion_cuadre",
        "Verificación formal de cuadre",
        _R,
        (("verificacion de cuadre", 22), ("cuadre formal", 16), ("revision de cuadre", 12)),
        "Menú: Reportes y estados → Verificación formal de cuadre.",
        ("Ejecute después de cerrar pólizas del periodo.", "Le ayuda a localizar desbalances entre balanza y balance.", "Documente hallazgos antes de firmar informes."),
    ),
    _t(
        "balance_general",
        "Balance general",
        _R,
        (
            ("balance general", 28),
            ("estado de posicion financiera", 16),
            ("activo pasivo capital", 12),
            ("balance", 8),
        ),
        "Menú: Reportes y estados → Balance general. F6.",
        ("F6; indique fecha de corte.", "Revise activo, pasivo y capital.", "Cruce con balanza y estado de resultados del mismo corte."),
    ),
    _t(
        "resultados",
        "Estado de resultados",
        _R,
        (
            ("estado de resultados", 24),
            ("pyg", 10),
            ("perdidas y ganancias", 14),
            ("utilidad neta", 10),
            ("resultados", 8),
        ),
        "Menú: Reportes y estados → Estado de resultados. F5.",
        ("F5; defina mes/año o acumulado según pantalla.", "Revise ingresos, costos, gastos y utilidad.", "Compare con presupuesto si su empresa lo usa."),
    ),
    _t(
        "flujo_efectivo",
        "Flujo de efectivo",
        _R,
        (("flujo de efectivo", 22), ("estado de flujo", 16), ("efectivo", 8)),
        "Menú: Reportes y estados → Flujo de efectivo.",
        ("Clasifique fuentes y usos de efectivo.", "Concilie con bancos y mayor de caja.", "Revise periodo y política contable de la empresa."),
    ),
    _t(
        "estados_financieros_motor",
        "Estados financieros (motor completo)",
        _R,
        (("estados financieros", 20), ("motor financiero", 14), ("bg y er", 8)),
        "Menú: Reportes y estados → Estados financieros (motor completo).",
        ("Use cuando necesite BG/ER con formatos o reglas extendidas.", "Verifique parámetros y ejercicio.", "Valide contra reportes simples si hay dudas."),
    ),
    _t(
        "reportes_avanzados",
        "Reportes avanzados",
        _R,
        (("reportes avanzados", 22), ("reporte avanzado", 16), ("analitica contable", 10)),
        "Menú / Explorador: Reportes avanzados.",
        ("Exploraciones y cruces fuera de los reportes estándar.", "Defina filtros con cuidado para no sobrecargar la vista.", "Exporte si necesita trabajar en Excel."),
    ),
    _t(
        "reporte_posicion_me",
        "Posición en moneda extranjera",
        _R,
        (("posicion en moneda extranjera", 22), ("posicion me", 14), ("exposicion cambiaria", 10)),
        "Menú: Reportes y estados → Posición en moneda extranjera.",
        ("Revise saldos en USD u otras monedas.", "Cruce con revaluación cambiaria y tipos de cambio.", "Documente para notas a estados financieros."),
    ),
    _t(
        "libro_mayor",
        "Libro mayor",
        _L,
        (("libro mayor", 22), ("mayor de cuentas", 16), ("movimientos por cuenta", 10)),
        "Menú: Reportes y estados → Libro mayor.",
        ("Seleccione cuenta(s) y rango de fechas.", "Revuelva saldos iniciales, movimientos y final.", "Use para pistas de auditoría y conciliaciones."),
    ),
    _t(
        "libro_diario_formal",
        "Libro diario (formal)",
        _L,
        (
            ("libro diario formal", 22),
            ("libro diario", 16),
            ("diario formal", 12),
        ),
        "Menú: Reportes y estados → Libro diario (formal).",
        ("Lista cronológica de pólizas con partidas.", "Filtre por fechas y tipos si la pantalla lo permite.", "Si su menú también dice «completo», use este mismo flujo si no hay otra opción."),
    ),
    _t(
        "diario_mayor_integrado",
        "Diario / Mayor integrado",
        _L,
        (("diario mayor integrado", 22), ("diario y mayor", 16)),
        "Menú: Reportes y estados → Diario–Mayor integrado.",
        ("Vista combinada para revisar detalle y saldos.", "Útil en revisiones de cierre.", "Exporte o imprima según política interna."),
    ),
    _t(
        "auxiliar_cuentas",
        "Auxiliar de cuentas",
        _L,
        (("auxiliar de cuentas", 22), ("auxiliar cuenta", 16), ("subcuenta movimientos", 8)),
        "Menú: Reportes y estados → Auxiliar de cuentas.",
        ("Elija cuenta y periodo.", "Concilie contra estados de banco o proveedores.", "Marque partidas ya conciliadas en su hoja de trabajo."),
    ),
    _t(
        "reporte_auxiliares",
        "Auxiliares (reporte)",
        _L,
        (("reporte de auxiliares", 20), ("auxiliares", 12)),
        "Menú: Reportes y estados → Auxiliares (reporte).",
        ("Listado agrupado de auxiliares según configuración.", "Compare con auxiliar de una sola cuenta si hay diferencias.", "Ideal para entregar a auditores."),
    ),
    _t(
        "saldo_por_periodo",
        "Saldo por periodo",
        _L,
        (("saldo por periodo", 20), ("consulta de saldos", 14), ("evolucion del saldo", 8)),
        "Menú Cuentas y pólizas o Reportes: consulta de saldo por periodo (según su versión del menú).",
        ("Útil para ver cómo evoluciona una cuenta mes a mes.", "Valide contra balanza del mismo mes.", "Si no localiza el ítem, use Libro mayor con cortes mensuales."),
        "saldo_periodo",
    ),
    _t(
        "cfdi_tablero",
        "Tablero CFDI",
        _F,
        (("tablero cfdi", 22), ("comprobantes fiscales", 12), ("listado cfdi", 10)),
        "Explorador: CFDI y fiscal → Tablero CFDI. También Reportes y estados → Tablero CFDI.",
        ("Centraliza XML timbrados y metadatos.", "Puede generar póliza automática o vincular UUID.", "Revise el diario de operaciones CFDI para eventos."),
    ),
    _t(
        "servicio_interno_cfdi",
        "Servicio interno CFDI (cola / FIEL)",
        _F,
        (("servicio interno", 20), ("descarga interna", 18), ("cola cfdi", 12), ("fiel", 8)),
        "Tablero CFDI → Descarga interna (CFDI)…",
        ("Configure carpeta de XML y opcionalmente rutas FIEL.", "Encole ventanas de hasta 4 meses y procese la cola.", "La bitácora queda en el diario del tablero."),
    ),
    _t(
        "contabilizador_cfdi",
        "Contabilizar CFDI (XML)",
        _F,
        (("contabilizar cfdi", 22), ("cfdi a poliza", 14), ("importar cfdi", 10)),
        "Menú: Herramientas → Contabilizar CFDI.",
        ("Seleccione XML y mapeo de cuentas.", "Revise la póliza generada antes de asumir que es definitiva.", "Valide IVA y retenciones contra el CFDI."),
    ),
    _t(
        "cfdi_importacion",
        "Importar y vincular CFDI 4.0",
        _F,
        (("importar cfdi 4", 20), ("vincular cfdi", 16), ("cfdi 4.0", 12)),
        "Menú: Herramientas → Importar y vincular CFDI 4.0…",
        ("Flujo masivo con mapeo y validaciones.", "Vincule UUID a pólizas existentes si ya contabilizó manualmente.", "Respalde antes de importaciones grandes."),
    ),
    _t(
        "contabilizar_carpeta",
        "Facturas timbradas (carpeta)",
        _F,
        (("contabilizar carpeta", 20), ("facturas timbradas", 16), ("carpeta xml", 12)),
        "Menú: Herramientas → Contabilizar facturas timbradas (carpeta).",
        ("Apunte a la carpeta donde el PAC dejó los XML.", "Revise log de éxitos y errores.", "Recalcule saldos si el volumen es alto."),
    ),
    _t(
        "conciliacion_cfdi",
        "Conciliación CFDI vs pólizas",
        _F,
        (("conciliacion cfdi", 22), ("cfdi sin poliza", 14), ("uuid sin contabilidad", 10)),
        "Menú: Reportes y estados → Conciliación CFDI vs pólizas.",
        ("Detecta CFDI sin póliza o diferencias de monto.", "Regularice con pólizas de ajuste o vinculación.", "Documente excepciones para fiscalía."),
    ),
    _t(
        "deposito_documentos",
        "Depósito de documentos",
        _F,
        (("deposito de documentos", 20), ("carpeta deposito", 12)),
        "Explorador: CFDI → Depósito de documentos.",
        ("Configure ruta local para XML/PDF entrantes.", "Integre con su flujo de escaneo o PAC.", "No sustituye el tablero: use ambos según el proceso."),
    ),
    _t(
        "impuestos",
        "Impuestos (IVA / retenciones)",
        _F,
        (("iva acreditable", 14), ("iva trasladado", 14), ("retenciones", 12), ("impuestos", 10)),
        "Menú: Reportes y estados → Impuestos (IVA/Retenciones).",
        ("Revise bases y cuentas de orden si aplica.", "Cruce con balanza y con reportes fiscales SAT.", "Ajuste pólizas si hay diferencias de centavos."),
    ),
    _t(
        "diot",
        "DIOT (proveedores)",
        _F,
        (("diot", 18), ("declaracion informativa", 12), ("operaciones con proveedores", 10)),
        "Menú: Reportes y estados → DIOT (proveedores).",
        ("Valide tipos de operación y proveedores.", "Exporte según formato requerido.", "Concilie con IVA acreditable en balanza."),
    ),
    _t(
        "fiscal_sat",
        "Reportes fiscales SAT (CFDI)",
        _F,
        (("reportes fiscales sat", 20), ("reporte fiscal", 12), ("cfdi fiscal", 10)),
        "Menú: Reportes y estados → Reportes fiscales SAT (CFDI).",
        ("IVA, retenciones, terceros y vistas relacionadas.", "Elija periodo y revise totales.", "Exporte para trabajo en hoja o revisión del SAT."),
    ),
    _t(
        "fiscal_xml",
        "Generar XML / módulo fiscal (F8)",
        _F,
        (("generar xml sat", 16), ("modulo fiscal", 12), ("contabilidad electronica", 14)),
        "Menú: Herramientas → Generar XML SAT. Atajo F8.",
        ("Use para paquetes de contabilidad electrónica según su configuración.", "Verifique RFC y periodo en parámetros.", "Respalde archivos generados."),
    ),
    _t(
        "paquete_xml_sat",
        "Paquete XML SAT (catálogo + balanza + pólizas)",
        _F,
        (("paquete xml sat", 22), ("catalogo balanza polizas", 14)),
        "Menú: Herramientas → Generar paquete XML SAT…",
        ("Flujo integrado de entregables SAT.", "Ejecute tras cerrar periodo y validar cuadre.", "Conserve constancia de envíos."),
    ),
    _t(
        "export_xml_polizas",
        "Exportar XML de pólizas SAT",
        _F,
        (("xml de polizas", 18), ("exportar polizas xml", 14)),
        "Menú: Herramientas → Exportar XML Pólizas SAT.",
        ("Genera XML de pólizas para requerimientos del SAT.", "Revise sellos y encabezados.", "Combine con balanza y catálogo según normativa vigente."),
    ),
    _t(
        "centros_costo",
        "Centros de costo / departamentos",
        _P,
        (("centro de costo", 18), ("departamentos", 12), ("centros de costo", 16)),
        "Menú: Cuentas y pólizas → Departamentos / centros de costo.",
        ("Defina jerarquía y responsables.", "Asigne cuentas o movimientos según política.", "Habilita ER y balanza por centro."),
    ),
    _t(
        "balanza_departamento",
        "Balanza por departamento",
        _P,
        (("balanza por departamento", 24), ("balanza por centro", 18)),
        "Menú: Reportes y estados → Departamentos / centros → Balanza por departamento.",
        ("Seleccione el centro a analizar.", "Compare contra balanza global.", "Use para control interno y reparto de gastos."),
        "balanza_departamento",
    ),
    _t(
        "er_departamento",
        "Estado de resultados por departamento",
        _P,
        (("resultados por departamento", 22), ("er por centro", 16)),
        "Menú: Reportes → Departamentos / centros → Estado de resultados por departamento.",
        ("Mide desempeño por área.", "Valide asignación de ingresos/gastos.", "Cruce con presupuesto por departamento."),
    ),
    _t(
        "presupuesto_centros",
        "Real vs presupuesto por departamento",
        _P,
        (("real vs presupuesto", 18), ("presupuesto por departamento", 20)),
        "Menú: Reportes → Departamentos / centros → Real vs presupuesto por departamento.",
        ("Compare ejecutado contra presupuesto por centro.", "Investigue desviaciones significativas.", "Documente causas para dirección."),
    ),
    _t(
        "presupuestos",
        "Presupuestos",
        _P,
        (("presupuesto", 16), ("captura presupuesto", 14), ("planeacion financiera", 8)),
        "Menú: Reportes y estados → Presupuestos.",
        ("Capture o importe presupuesto anual/mensual.", "Compare con real en reportes dedicados.", "Alinee con centros de costo si aplica."),
    ),
    _t(
        "cierre_mensual",
        "Cierre mensual",
        _X,
        (("cierre mensual", 22), ("cerrar mes", 14), ("cierre contable", 12)),
        "Menú: Procesos y cierre → Cierre mensual.",
        ("Cuadre balanza y revise CFDI pendientes.", "Ejecute asientos de cierre según manual interno.", "Bloquee el periodo si corresponde."),
    ),
    _t(
        "cierre_anual",
        "Cierre anual",
        _X,
        (("cierre anual", 22), ("cerrar ejercicio", 16), ("apertura siguiente", 10)),
        "Menú: Procesos y cierre → Cierre anual.",
        ("Respaldo obligatorio antes de proceder.", "Revise utilidad fiscal vs contable si hay diferencias.", "Genere póliza de apertura del nuevo ejercicio."),
    ),
    _t(
        "depreciacion",
        "Depreciación de activos",
        _X,
        (("depreciacion mensual", 18), ("depreciacion de activos", 16), ("f7", 6)),
        "Menú: Procesos y cierre → Depreciación de activos (F7).",
        ("Ejecute en cada cierre mensual si aplica.", "Revise cuentas de gasto y activo.", "Concilie con activos fijos."),
    ),
    _t(
        "revaluacion_cambiaria",
        "Revaluación cambiaria (ME)",
        _X,
        (("revaluacion cambiaria", 22), ("ajuste tipo de cambio", 14), ("utilidad cambiaria", 10)),
        "Menú: Procesos y cierre → Revaluación cambiaria (ME)…",
        ("Ajuste saldos en moneda extranjera al cierre.", "Revise cuentas de orden y resultados.", "Documente tasas usadas."),
    ),
    _t(
        "monedas",
        "Monedas y tipo de cambio",
        _X,
        (("tipo de cambio", 16), ("monedas", 12), ("divisas", 10), ("usd mxn", 8)),
        "Menú: Cuentas y pólizas → Monedas.",
        ("Mantenga tipos de cambio del periodo.", "Sincronice con fuentes oficiales si está configurado.", "Las pólizas en ME usarán estas tasas."),
    ),
    _t(
        "bancos",
        "Bancos",
        _X,
        (("bancos", 12), ("cuenta bancaria", 10), ("conciliacion bancaria", 12)),
        "Menú: Cuentas y pólizas → Bancos.",
        ("Alta de cuentas bancarias y parámetros.", "Base para conciliación y flujo de efectivo.", "Cruce saldos con auxiliares."),
    ),
    _t(
        "parametros",
        "Parámetros y configuración general",
        _A,
        (("parametros", 14), ("configuracion general", 16), ("folios", 8), ("empresa y ejercicio", 10)),
        "Menú: Administración → Parámetros y configuración general.",
        ("RFC, razón social, ejercicio y opciones fiscales.", "Revise pestañas de SAT, impresión y presupuesto.", "Guarde antes de generar XML fiscal."),
    ),
    _t(
        "datos_empresa",
        "Datos de empresa",
        _A,
        (("datos de empresa", 18), ("cambiar empresa", 10), ("razon social", 8)),
        "Menú: Administración → Datos de empresa.",
        ("Empresa activa y datos fiscales básicos.", "Coherente con CFDI y reportes.", "Tras cambios, regenere reportes de prueba."),
    ),
    _t(
        "config_cfd",
        "Configuración CFD / CSD",
        _A,
        (("configuracion cfd", 16), ("certificado sat", 12), ("csd", 8)),
        "Menú: Administración → Configuración CFD.",
        ("Rutas de certificado y llave privada para timbrado/XML.", "No confundir con FIEL del servicio interno CFDI (otro módulo).", "Respalde fuera de la carpeta pública."),
    ),
    _t(
        "usuarios",
        "Usuarios y permisos",
        _A,
        (("usuarios", 14), ("permisos", 12), ("seguridad", 8)),
        "Menú: Administración → Usuarios.",
        ("Alta y perfiles de acceso.", "Principio de mínimo privilegio.", "Revise auditoría periódicamente."),
    ),
    _t(
        "log_auditoria",
        "Log de auditoría",
        _A,
        (("auditoria", 14), ("bitacora", 10), ("log de cambios", 10)),
        "Menú: Herramientas → Log de auditoria.",
        ("Rastrea cambios sensibles.", "Use en investigaciones internas.", "Exporte si necesita evidencia."),
    ),
    _t(
        "bloqueo_periodos",
        "Bloquear / desbloquear periodo",
        _A,
        (("bloquear periodo", 20), ("desbloquear periodo", 18), ("periodo cerrado", 10)),
        "Menú: Herramientas → Bloquear / Desbloquear periodo.",
        ("Evita pólizas en meses cerrados.", "Solo supervisores según parámetros.", "Documente desbloqueos excepcionales."),
    ),
    _t(
        "proveedor_timbrado",
        "Proveedor de timbrado",
        _A,
        (("proveedor de timbrado", 18), ("facturama", 8), ("facturapi", 8)),
        "Barra de herramientas: Proveedor, o Administración → Seleccionar proveedor.",
        ("Elija PAC o motor de timbrado configurado.", "Pruebe en ambiente de pruebas antes de producción.", "Guarde credenciales de forma segura."),
        "proveedor_timbrado",
    ),
    _t(
        "interfaces_sae",
        "Aspel SAE → COI (interfaces)",
        _H,
        (("aspel sae", 16), ("sae coi", 14), ("interface sae", 12)),
        "Explorador: pestaña Interfaces → Aspel SAE → COI.",
        ("Cambia el explorador a Interfaces y el submódulo SAE.", "Descargue operaciones y revise diario.", "Valide empresas integradas."),
    ),
    _t(
        "diario_operaciones_sae",
        "Diario de operaciones SAE",
        _H,
        (("diario de operaciones", 18), ("operaciones descargadas sae", 12)),
        "Explorador: Interfaces → Aspel SAE → Diario de operaciones.",
        ("Lista movimientos traídos de SAE.", "Contabilice o valide contra COI.", "Cruce con pólizas generadas."),
    ),
    _t(
        "descargar_operaciones_sae",
        "Descargar operaciones SAE",
        _H,
        (("descargar operaciones", 16), ("descarga sae", 12)),
        "Explorador: Interfaces → Descargar operaciones (o ventana Empresas integradas / flujo manual).",
        ("Ejecute la descarga según el simulador o conector configurado.", "Verifique estatus en diario.", "Repita si hubo errores de red."),
    ),
    _t(
        "empresas_integradas_sae",
        "Empresas integradas SAE",
        _H,
        (("empresas integradas", 16), ("empresas sae", 14)),
        "Explorador: Interfaces → Aspel SAE → Empresas integradas.",
        ("Vea qué empresas SAE están enlazadas a este COI.", "Configure o valide la conexión simulada/real según su entorno.", "Luego use Descargar operaciones o Diario."),
    ),
    _t(
        "calculadora",
        "Calculadora",
        _H,
        (("calculadora", 14),),
        "Menú: Herramientas → Calculadora.",
        ("Operaciones rápidas sin salir del sistema.", "Útil al capturar pólizas."),
    ),
    _t(
        "exportar_excel",
        "Exportar a Excel",
        _H,
        (("exportar excel", 18), ("xlsx", 8)),
        "Menú: Herramientas → Exportar a Excel.",
        ("Exporta vistas o tablas según el módulo activo.", "Revise formato y fórmulas en Excel.", "No altere y reimporte sin validar."),
    ),
    _t(
        "recalcular_saldos",
        "Recalcular saldos mensuales",
        _H,
        (("recalcular saldos", 22), ("saldos mensuales", 14), ("reprocesar saldos", 12)),
        "Menú: Herramientas → Recalcular saldos mensuales.",
        ("Use tras correcciones masivas o recuperación.", "Puede tardar en bases grandes.", "Ejecute fuera de horario pico si es posible."),
    ),
    _t(
        "novedades",
        "Novedades del sistema",
        _H,
        (("novedades", 14), ("changelog", 8), ("cambios recientes", 10)),
        "Menú: Ayuda → Novedades (Cambios recientes).",
        ("Revise qué cambió en su versión.", "Alinee pruebas con la guía interna."),
    ),
    _t(
        "vista_panel_explorador",
        "Ocultar panel lateral o explorador",
        _H,
        (("panel lateral", 14), ("explorador", 10), ("maximizar area", 12)),
        "Menú: Vista → Panel lateral / Iconos explorador. Atajos Ctrl+Shift+L y Ctrl+Shift+E.",
        ("Gana espacio para tablas grandes.", "Vuelva a mostrar barras cuando necesite accesos rápidos.", "Maximizar área combina ambas."),
        "vista_maximizar_area",
    ),
)


def _cat_sort_key(categoria: str) -> int:
    try:
        return ORDEN_CATEGORIAS.index(categoria)
    except ValueError:
        return 99


def puntuar_tema(texto_norm: str, tema: TemaAsistente) -> int:
    if not texto_norm:
        return 0
    score = 0
    kws = sorted(tema.keywords, key=lambda x: -len(x[0]))
    for frase, peso in kws:
        f = _sin_acentos(frase)
        if f and f in texto_norm:
            score += peso
    if tema.id == "balanza" and "balance general" in texto_norm:
        score -= 12
    if tema.id == "balance_general" and "balanza" in texto_norm and "balance general" not in texto_norm:
        score -= 8
    if tema.id == "fiscal_sat" and "diot" in texto_norm:
        score -= 10
    if tema.id == "balanza" and ("acumulada" in texto_norm or "comparativa" in texto_norm or "dos ejercicios" in texto_norm):
        score -= 15
    return max(0, score)


def buscar_temas(texto_usuario: str, *, top: int = 8) -> List[Tuple[TemaAsistente, int]]:
    n = normalizar_consulta(texto_usuario)
    if not n:
        return []
    ranked: List[Tuple[TemaAsistente, int]] = []
    for t in TEMAS:
        s = puntuar_tema(n, t)
        if s > 0:
            ranked.append((t, s))
    ranked.sort(key=lambda x: (-x[1], _cat_sort_key(x[0].categoria), x[0].titulo))
    return ranked[:top]


def tema_por_id(tid: str) -> Optional[TemaAsistente]:
    for t in TEMAS:
        if t.id == tid:
            return t
    return None


def formatear_guia(tema: TemaAsistente) -> str:
    lineas = [
        tema.titulo,
        f"[{tema.categoria}]",
        "",
        "Dónde está",
        tema.donde_esta,
        "",
        "Pasos sugeridos",
    ]
    lineas.extend(f"{i}. {p}" for i, p in enumerate(tema.pasos, 1) if (p or "").strip())
    return "\n".join(lineas)


def resumen_opciones() -> List[Dict[str, Any]]:
    ordenados = sorted(TEMAS, key=lambda x: (_cat_sort_key(x.categoria), x.titulo))
    return [{"id": t.id, "titulo": t.titulo, "categoria": t.categoria} for t in ordenados]


def temas_por_categoria() -> Dict[str, List[TemaAsistente]]:
    d: Dict[str, List[TemaAsistente]] = {c: [] for c in ORDEN_CATEGORIAS}
    for t in TEMAS:
        d.setdefault(t.categoria, []).append(t)
    for c in d:
        d[c].sort(key=lambda x: x.titulo)
    return d


PREGUNTAS_EJEMPLO: Tuple[Tuple[str, str], ...] = (
    ("¿Dónde genero la balanza de comprobación?", "balanza comprobacion mes"),
    ("¿Cómo cierro el mes contable?", "cierre mensual"),
    ("Balance general al último día del mes", "balance general"),
    ("Importar XML de facturas y contabilizar", "contabilizar cfdi"),
    ("CFDI que no tienen póliza", "conciliacion cfdi"),
    ("Bloquear el periodo para que no modifiquen", "bloquear periodo"),
    ("DIOT de proveedores", "diot"),
    ("Descarga interna de CFDI y cola", "servicio interno cfdi"),
    ("Conectar Aspel SAE con este COI", "aspel sae"),
    ("Recalcular saldos después de borrar pólizas", "recalcular saldos"),
    ("Estado de resultados del mes", "estado de resultados"),
    ("Libro mayor de una cuenta", "libro mayor"),
    ("Presupuesto vs real", "presupuesto"),
    ("Parámetros RFC y ejercicio", "parametros sistema"),
)
