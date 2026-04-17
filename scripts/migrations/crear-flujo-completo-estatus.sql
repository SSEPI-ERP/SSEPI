-- ================================================
-- FLUJO COMPLETO DE ESTATUS - SSEPI
-- Tablas para tracking de órdenes a través de:
-- Ventas → Taller → Compras → Facturación → Entrega
-- ================================================

-- ================================================
-- 1. TABLA PRINCIPAL DE SEGUIMIENTO
-- ================================================
CREATE TABLE IF NOT EXISTS public.orden_seguimiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id UUID REFERENCES public.cotizaciones(id),
    orden_taller_id UUID REFERENCES public.ordenes_taller(id),
    orden_motor_id UUID REFERENCES public.ordenes_motores(id),
    proyecto_id UUID REFERENCES public.proyectos_automatizacion(id),

    -- Estatus generales del flujo
    estatus_general VARCHAR(50) DEFAULT 'registro', -- registro, en_diagnostico, en_compras, en_cotizacion, autorizado, en_reparacion, en_facturacion, entregado

    -- Estatus por módulo
    estatus_taller VARCHAR(50) DEFAULT 'pendiente', -- pendiente, diagnostico, esperando_materiales, en_reparacion, terminado
    estatus_compras VARCHAR(50) DEFAULT 'pendiente', -- pendiente, buscando_materiales, cotizando_proveedores, autorizado, comprado, recibido
    estatus_ventas VARCHAR(50) DEFAULT 'registro', -- registro, espera_compras, cotizando, esperando_autorizacion, autorizado, entregando
    estatus_facturacion VARCHAR(50) DEFAULT 'pendiente', -- pendiente, facturando, facturado

    -- Tiempos estimados
    fecha_estimada_entrega DATE,
    tiempo_espera_proveedor_dias INTEGER,

    -- Notas y seguimiento
    notas_internas TEXT,
    notas_cliente TEXT,

    -- Auditoría
    creado_por UUID,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_seguimiento_cotizacion ON public.orden_seguimiento(cotizacion_id);
CREATE INDEX idx_seguimiento_taller ON public.orden_seguimiento(orden_taller_id);
CREATE INDEX idx_seguimiento_estatus ON public.orden_seguimiento(estatus_general);

-- ================================================
-- 2. TABLA DE EVENTOS DEL HISTORIAL
-- ================================================
CREATE TABLE IF NOT EXISTS public.orden_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seguimiento_id UUID REFERENCES public.orden_seguimiento(id) ON DELETE CASCADE,

    -- Tipo de evento
    tipo_evento VARCHAR(50) NOT NULL, -- diagnostico_completado, materiales_solicitados, cotizacion_enviada, cliente_autorizo, compra_realizada, material_recibido, reparacion_iniciada, reparacion_completada, factura_generada, entregado_cliente

    -- Módulo que genera el evento
    modulo_origen VARCHAR(50) NOT NULL, -- ventas, taller, compras, facturacion

    -- Descripción y detalles
    descripcion TEXT,
    detalles JSONB,

    -- Usuario que realizó la acción
    usuario_id UUID,

    -- Timestamp
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eventos_seguimiento ON public.orden_eventos(seguimiento_id);
CREATE INDEX idx_eventos_tipo ON public.orden_eventos(tipo_evento);
CREATE INDEX idx_eventos_fecha ON public.orden_eventos(creado_en);

-- ================================================
-- 3. TABLA DE MATERIALES POR ORDEN
-- ================================================
CREATE TABLE IF NOT EXISTS public.orden_materiales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seguimiento_id UUID REFERENCES public.orden_seguimiento(id) ON DELETE CASCADE,

    -- Datos del material
    nombre_material TEXT NOT NULL,
    descripcion TEXT,
    cantidad INTEGER DEFAULT 1,
    unidad_medida VARCHAR(20) DEFAULT 'pz',

    -- Costos y proveedor
    costo_unitario NUMERIC(12,2),
    costo_total NUMERIC(12,2),
    proveedor_sugerido TEXT,
    tiempo_entrega_dias INTEGER,

    -- Estatus del material
    estatus_material VARCHAR(50) DEFAULT 'pendiente', -- pendiente, en_stock, faltante, cotizado, comprado, recibido

    -- Referencias
    inventario_id UUID REFERENCES public.inventario(id),
    compra_id UUID REFERENCES public.compras(id),

    -- Auditoría
    creado_por UUID,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_materiales_seguimiento ON public.orden_materiales(seguimiento_id);
CREATE INDEX idx_materiales_estatus ON public.orden_materiales(estatus_material);

-- ================================================
-- 4. TABLA DE FOTOS/DOCUMENTOS ADJUNTOS
-- ================================================
CREATE TABLE IF NOT EXISTS public.orden_adjuntos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seguimiento_id UUID REFERENCES public.orden_seguimiento(id) ON DELETE CASCADE,

    -- Tipo de adjunto
    tipo_adjunto VARCHAR(50) DEFAULT 'foto', -- foto, pdf, documento, evidencia

    -- URL del archivo (storage)
    url_archivo TEXT NOT NULL,
    nombre_original TEXT,
    tamaño_bytes INTEGER,

    -- Descripción opcional
    descripcion TEXT,

    -- Módulo que sube el adjunto
    modulo_origen VARCHAR(50),

    -- Auditoría
    subido_por UUID,
    subido_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_adjuntos_seguimiento ON public.orden_adjuntos(seguimiento_id);
CREATE INDEX idx_adjuntos_tipo ON public.orden_adjuntos(tipo_adjunto);

-- ================================================
-- 5. VISTA UNIFICADA DE ESTATUS
-- ================================================
CREATE OR REPLACE VIEW public.vista_estatus_orden AS
SELECT
    s.id,
    s.cotizacion_id,
    s.orden_taller_id,
    s.orden_motor_id,
    s.proyecto_id,
    s.estatus_general,
    s.estatus_taller,
    s.estatus_compras,
    s.estatus_ventas,
    s.estatus_facturacion,
    s.fecha_estimada_entrega,
    s.tiempo_espera_proveedor_dias,
    c.folio as folio_cotizacion,
    ct.nombre as cliente_nombre,
    c.total,
    ot.folio as folio_taller,
    ot_ct.nombre as taller_cliente_nombre,
    om.folio as folio_motor,
    om_ct.nombre as motores_cliente_nombre,
    p.folio as folio_proyecto,
    p_ct.nombre as proyectos_cliente_nombre,
    (SELECT COUNT(*) FROM public.orden_eventos e WHERE e.seguimiento_id = s.id) as total_eventos,
    (SELECT MAX(e.creado_en) FROM public.orden_eventos e WHERE e.seguimiento_id = s.id) as ultimo_evento
FROM public.orden_seguimiento s
LEFT JOIN public.cotizaciones c ON c.id = s.cotizacion_id
LEFT JOIN public.contactos ct ON ct.id = c.cliente_id
LEFT JOIN public.ordenes_taller ot ON ot.id = s.orden_taller_id
LEFT JOIN public.contactos ot_ct ON ot_ct.id = ot.cliente_id
LEFT JOIN public.ordenes_motores om ON om.id = s.orden_motor_id
LEFT JOIN public.contactos om_ct ON om_ct.id = om.cliente_id
LEFT JOIN public.proyectos_automatizacion p ON p.id = s.proyecto_id
LEFT JOIN public.contactos p_ct ON p_ct.id = p.cliente_id;

-- ================================================
-- 6. NOTIFICAR A POSTGREST
-- ================================================
NOTIFY pgrst, 'reload schema';

-- ================================================
-- COMENTARIOS DE DOCUMENTACIÓN
-- ================================================
COMMENT ON TABLE public.orden_seguimiento IS 'Tracking principal de órdenes a través de todos los módulos (Ventas → Taller → Compras → Facturación → Entrega)';
COMMENT ON TABLE public.orden_eventos IS 'Historial de eventos y cambios de estatus de cada orden';
COMMENT ON TABLE public.orden_materiales IS 'Materiales requeridos por orden, con estatus de stock/compra';
COMMENT ON TABLE public.orden_adjuntos IS 'Fotos y documentos adjuntos (evidencias, paquetes recibidos, etc.)';
COMMENT ON VIEW public.vista_estatus_orden IS 'Vista unificada para consulta rápida de estatus de órdenes';
