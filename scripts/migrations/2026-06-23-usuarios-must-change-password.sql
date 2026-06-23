-- ============================================================================
-- 2026-06-23 — Fase 0.4: Política de contraseñas
-- Añade marca `must_change_password` a usuarios (NO toca datos ni passwords).
-- El ERP se vende con los usuarios/BD de SSEPI intactos; esto solo habilita
-- forzar el cambio de contraseña por usuario cuando se rote un password expuesto.
-- Idempotente.
-- ============================================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- (Opcional, manual) Marcar usuarios cuyo password fue expuesto para forzar
-- cambio en el próximo login. Descomentar y ejecutar solo cuando se roten las
-- contraseñas en cloud (Fase 0.2) — no ejecutar a ciegas:
-- UPDATE usuarios SET must_change_password = TRUE WHERE must_change_password IS FALSE;

-- Comentario para documentación del esquema
COMMENT ON COLUMN usuarios.must_change_password IS
  'Si TRUE, el login redirige a cambiar-password.html hasta que el usuario rote su contraseña (Fase 0.4).';