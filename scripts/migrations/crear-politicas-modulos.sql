-- ============================================
-- POLÍTICAS POR MÓDULO - NUEVO SUPABASE
-- Proyecto: knzmdwjmrhcoytmebdwa
-- ============================================

-- 1. TABLA POLITICAS_MODULOS
CREATE TABLE IF NOT EXISTS public.politicas_modulos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    modulo VARCHAR(50) NOT NULL UNIQUE,
    titulo VARCHAR(200) NOT NULL,
    tiempo_entrega TEXT NOT NULL,
    moneda VARCHAR(20) DEFAULT 'MONEDA NACIONAL',
    requiere_oc BOOLEAN DEFAULT true,
    acepta_cancelaciones BOOLEAN DEFAULT false,
    garantia_dias INTEGER DEFAULT 30,
    notas_importantes JSONB NOT NULL,
    url_terminos TEXT DEFAULT 'https://www.ssepi.org/terms',
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. INSERTAR POLÍTICAS (usando jsonb_build_array para evitar errores de encoding)
INSERT INTO politicas_modulos (modulo, titulo, tiempo_entrega, garantia_dias, notas_importantes)
VALUES (
  'taller_electronica',
  'Politicas para reparacion de equipos electronicos',
  'INMEDIATA a partir de la OC',
  30,
  jsonb_build_array(
    'Garantia 30 dias sobre falla reparada',
    'No cubre daños por sobretension o manipulacion ajena',
    'No incluye instalacion ni montaje'
  )
)
ON CONFLICT (modulo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  tiempo_entrega = EXCLUDED.tiempo_entrega,
  garantia_dias = EXCLUDED.garantia_dias,
  notas_importantes = EXCLUDED.notas_importantes,
  updated_at = NOW();

INSERT INTO politicas_modulos (modulo, titulo, tiempo_entrega, garantia_dias, notas_importantes)
VALUES (
  'taller_motores',
  'Politicas para reparacion de Motores',
  '1 SEMANA a partir de la OC',
  30,
  jsonb_build_array(
    'Garantia 30 dias sobre falla reparada',
    'No cubre daños por sobretension o manipulacion ajena',
    'No incluye instalacion ni montaje'
  )
)
ON CONFLICT (modulo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  tiempo_entrega = EXCLUDED.tiempo_entrega,
  garantia_dias = EXCLUDED.garantia_dias,
  notas_importantes = EXCLUDED.notas_importantes,
  updated_at = NOW();

INSERT INTO politicas_modulos (modulo, titulo, tiempo_entrega, garantia_dias, notas_importantes)
VALUES (
  'ventas_suministros',
  'Politicas para ventas de suministro',
  'Desde confirmacion de pago',
  0,
  jsonb_build_array(
    'Precios en USD, pago en MXN tipo cambio DOF',
    'No devoluciones en refacciones bajo pedido',
    'Garantia directa del fabricante'
  )
)
ON CONFLICT (modulo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  tiempo_entrega = EXCLUDED.tiempo_entrega,
  garantia_dias = EXCLUDED.garantia_dias,
  notas_importantes = EXCLUDED.notas_importantes,
  updated_at = NOW();

INSERT INTO politicas_modulos (modulo, titulo, tiempo_entrega, garantia_dias, notas_importantes)
VALUES (
  'automatizacion',
  'Politicas para proyectos de Automatizacion',
  '50% anticipo, 50% al terminar',
  45,
  jsonb_build_array(
    '50% de anticipo requerido',
    'Garantia 45 dias sobre programacion e integracion',
    'Propiedad intelectual hasta liquidacion total'
  )
)
ON CONFLICT (modulo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  tiempo_entrega = EXCLUDED.tiempo_entrega,
  garantia_dias = EXCLUDED.garantia_dias,
  notas_importantes = EXCLUDED.notas_importantes,
  updated_at = NOW();

INSERT INTO politicas_modulos (modulo, titulo, tiempo_entrega, garantia_dias, notas_importantes)
VALUES (
  'soporte_planta',
  'Politicas para Soporte a planta',
  'Atencion correctiva urgente',
  0,
  jsonb_build_array(
    'Servicio correctivo puntual, no garantia integral',
    'Fallas distintas se consideran nuevo servicio',
    'Firma de conformidad requerida'
  )
)
ON CONFLICT (modulo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  tiempo_entrega = EXCLUDED.tiempo_entrega,
  garantia_dias = EXCLUDED.garantia_dias,
  notas_importantes = EXCLUDED.notas_importantes,
  updated_at = NOW();

-- 3. RLS
ALTER TABLE politicas_modulos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS politicas_modulos_all ON politicas_modulos;
CREATE POLICY politicas_modulos_all ON politicas_modulos FOR ALL TO authenticated USING (true) WITH CHECK (true);
