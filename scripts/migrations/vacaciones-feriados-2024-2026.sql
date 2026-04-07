-- Feriados México: 2024 y 2026 para vista anual del calendario de vacaciones
-- Ejecutar en Supabase SQL Editor (idempotente con ON CONFLICT DO NOTHING).

INSERT INTO public.vacaciones_dias_feriados (fecha, nombre, tipo) VALUES
  ('2024-01-01', 'Año Nuevo', 'legal'),
  ('2024-02-05', 'Día de la Constitución', 'legal'),
  ('2024-03-18', 'Natalicio de Benito Juárez', 'legal'),
  ('2024-05-01', 'Día del Trabajo', 'legal'),
  ('2024-09-16', 'Día de la Independencia', 'legal'),
  ('2024-11-18', 'Revolución Mexicana', 'legal'),
  ('2024-12-25', 'Navidad', 'legal'),
  ('2024-03-29', 'Viernes Santo', 'religioso'),
  ('2024-11-02', 'Día de Muertos', 'suspension_labores'),
  ('2024-12-12', 'Día de la Virgen de Guadalupe', 'religioso'),
  ('2026-01-01', 'Año Nuevo', 'legal'),
  ('2026-02-02', 'Día de la Constitución', 'legal'),
  ('2026-03-16', 'Natalicio de Benito Juárez', 'legal'),
  ('2026-05-01', 'Día del Trabajo', 'legal'),
  ('2026-09-16', 'Día de la Independencia', 'legal'),
  ('2026-11-16', 'Revolución Mexicana', 'legal'),
  ('2026-12-25', 'Navidad', 'legal'),
  ('2026-04-03', 'Viernes Santo', 'religioso'),
  ('2026-11-02', 'Día de Muertos', 'suspension_labores'),
  ('2026-12-12', 'Día de la Virgen de Guadalupe', 'religioso')
ON CONFLICT (fecha) DO NOTHING;
