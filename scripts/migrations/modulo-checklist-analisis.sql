-- =============================================================================
-- Checklist + razones por módulo/registro (para análisis: por qué se hizo / por qué no)
-- Ejecutar en Supabase SQL Editor.
-- Requiere: public.ssepi_current_rol() (si no existe, define un fallback simple).
-- =============================================================================

create extension if not exists "pgcrypto";

-- Fallback si no existe (no rompe si ya existe)
create or replace function public.ssepi_current_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.rol from public.usuarios u where u.auth_user_id = auth.uid() limit 1),
    (select u.rol from public.users u where u.auth_user_id = auth.uid() limit 1),
    ''
  );
$$;

create table if not exists public.modulo_checklists (
  id uuid primary key default gen_random_uuid(),
  modulo text not null,                 -- 'ordenes_taller' | 'ordenes_motores' | 'proyectos_automatizacion' | 'soporte_visitas' | 'compras' | etc.
  registro_id uuid,                     -- id del registro (orden/proyecto/compra), nullable para checklist general
  estado text not null default 'pendiente' check (estado in ('pendiente','confirmado','en_progreso','completado','cancelado','no_aplica')),
  motivo_si text,                       -- por qué sí se desarrolló / se completó
  motivo_no text,                       -- por qué no / bloqueo
  checklist_json jsonb not null default '[]'::jsonb, -- [{id,label,ok,nota,ts}]
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid default auth.uid()
);

create index if not exists idx_modcheck_mod on public.modulo_checklists(modulo);
create index if not exists idx_modcheck_reg on public.modulo_checklists(registro_id);
create index if not exists idx_modcheck_estado on public.modulo_checklists(estado);

alter table public.modulo_checklists enable row level security;

drop policy if exists modcheck_select_auth on public.modulo_checklists;
create policy modcheck_select_auth
  on public.modulo_checklists for select to authenticated
  using (true);

-- Escritura: admin/superadmin y dueños de módulo (taller/motores/automatizacion/contabilidad/compras/ventas)
drop policy if exists modcheck_mutate_team on public.modulo_checklists;
create policy modcheck_mutate_team
  on public.modulo_checklists for all to authenticated
  using (public.ssepi_current_rol() in ('admin','superadmin','taller','motores','automatizacion','contabilidad','compras','ventas','facturacion'))
  with check (public.ssepi_current_rol() in ('admin','superadmin','taller','motores','automatizacion','contabilidad','compras','ventas','facturacion'));

grant select, insert, update, delete on public.modulo_checklists to authenticated;

