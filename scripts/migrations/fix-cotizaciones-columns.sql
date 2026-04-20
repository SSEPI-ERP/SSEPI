-- Fix: Agregar columna cerebro_registro a cotizaciones
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS cerebro_registro JSONB DEFAULT '{}';

-- Fix: Agregar columna orden_origen_id si no existe
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS orden_origen_id UUID;

-- Fix: Agregar columna vendedor si no existe
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS vendedor TEXT;

-- Fix: Agregar columna email si no existe
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS email TEXT;

-- Fix: Agregar columna telefono si no existe
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS telefono TEXT;

-- Fix: Agregar columna rfc si no existe
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS rfc TEXT;