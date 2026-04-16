-- =====================================================
-- Tabla: audit_logs (extensión para import/export)
-- Descripción: Registra todas las acciones de importación/exportación de datos
-- Notificaciones: Admins y Norberto reciben alerta de estas acciones
-- =====================================================

-- 1. CREAR TABLA SI NO EXISTE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  user_id UUID,
  user_email TEXT,
  module TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  severity TEXT DEFAULT 'info',
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  records_processed INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  file_name TEXT
);

-- 2. Índices básicos
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON public.audit_logs(module);

-- 3. RLS (Row Level Security)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas si existen para recrearlas
DROP POLICY IF EXISTS "Admins pueden leer audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Solo admins insertan en audit_logs" ON public.audit_logs;

-- Política: Admins pueden leer todo
CREATE POLICY "Admins pueden leer audit_logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE auth_user_id = auth.uid()
        AND rol IN ('admin', 'superadmin')
    )
  );

-- Política: Solo admins pueden insertar
CREATE POLICY "Solo admins insertan en audit_logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE auth_user_id = auth.uid()
        AND rol IN ('admin', 'superadmin')
    )
  );

-- 4. Columnas adicionales (si faltan - para compatibilidad)
DO $$
BEGIN
  -- Agregar columna module si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'module') THEN
    ALTER TABLE public.audit_logs ADD COLUMN module TEXT;
  END IF;

  -- Agregar columna records_processed si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'records_processed') THEN
    ALTER TABLE public.audit_logs ADD COLUMN records_processed INTEGER DEFAULT 0;
  END IF;

  -- Agregar columna errors_count si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'errors_count') THEN
    ALTER TABLE public.audit_logs ADD COLUMN errors_count INTEGER DEFAULT 0;
  END IF;

  -- Agregar columna file_name si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'file_name') THEN
    ALTER TABLE public.audit_logs ADD COLUMN file_name TEXT;
  END IF;
END $$;

-- Los índices ya se crearon arriba, estos son redundantes pero seguros

-- Notificaciones para admins y Norberto
-- Se crea una vista para consultar notificaciones pendientes
DROP VIEW IF EXISTS public.vw_notificaciones_audit;
CREATE OR REPLACE VIEW public.vw_notificaciones_audit AS
SELECT
  al.id,
  al.action,
  al.module,
  al.records_processed,
  al.errors_count,
  al.file_name,
  al.user_email,
  al.timestamp,
  al.details,
  CASE
    WHEN al.errors_count > 0 THEN 'warning'
    WHEN al.action = 'import' THEN 'info'
    ELSE 'success'
  END as notification_type
FROM public.audit_logs al
WHERE al.action IN ('import', 'export')
  AND al.timestamp > NOW() - INTERVAL '7 days'
ORDER BY al.timestamp DESC;

-- Comentario descriptivo
COMMENT ON VIEW public.vw_notificaciones_audit IS
  'Vista para notificaciones de import/export a admins y Norberto. Muestra acciones de los últimos 7 días.';

-- Función para crear notificación automática al importar/exportar
DROP FUNCTION IF EXISTS public.create_audit_notification();
CREATE OR REPLACE FUNCTION public.create_audit_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Insertar en tabla de notificaciones si existe
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    INSERT INTO public.notifications (user_id, title, message, type, is_read, created_at)
    SELECT
      u.id,
      CASE
        WHEN NEW.action = 'import' THEN 'Importación de datos'
        ELSE 'Exportación de datos'
      END,
      CASE
        WHEN NEW.errors_count > 0 THEN
          'Se ' || NEW.action || 'ó el módulo ' || COALESCE(NEW.module, 'general') ||
          ' con ' || NEW.errors_count || ' errores'
        ELSE
          'Se ' || NEW.action || 'ó el módulo ' || COALESCE(NEW.module, 'general') ||
          ' exitosamente (' || NEW.records_processed || ' registros)'
      END,
      CASE
        WHEN NEW.errors_count > 0 THEN 'warning'
        ELSE 'info'
      END,
      FALSE,
      NEW.timestamp
    FROM public.usuarios u
    WHERE u.rol IN ('admin', 'superadmin')
       OR u.email = 'norbertomoro4@gmail.com';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para crear notificaciones automáticas
DROP TRIGGER IF EXISTS trg_audit_notification ON public.audit_logs;
CREATE TRIGGER trg_audit_notification
  AFTER INSERT ON public.audit_logs
  FOR EACH ROW
  WHEN (NEW.action IN ('import', 'export'))
  EXECUTE FUNCTION public.create_audit_notification();
