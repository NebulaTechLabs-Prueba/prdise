-- ============================================================================
-- 0006 — Tabla `drivers` (choferes de transfers)
-- ============================================================================
--
-- `vehicles` ya existe en business_domain (modelo + capacidad). `drivers` es
-- una tabla independiente para el catálogo de choferes asignables a transfers.
-- Soft delete vía `deleted_at`. RLS: lectura abierta a autenticados,
-- escritura solo a quien tenga el permiso granular `transfers:write` (o admin).
-- ============================================================================

create table public.drivers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text,
  email           text,
  license         text,
  -- Modelo + matrícula como texto libre (no normalizamos a FK de vehicles
  -- porque el mismo chofer puede rotar de unidad y el panel lo lleva manual).
  vehicle         text,
  emergency_phone text,
  web_visible     boolean not null default false,
  status          text not null default 'available'
                  check (status in ('available', 'in_trip', 'off')),
  rating          numeric(3,2) not null default 0
                  check (rating >= 0 and rating <= 5),
  trips_count     integer not null default 0 check (trips_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

comment on table public.drivers is
  'Catálogo de choferes para transfers. Soft delete vía deleted_at.';

create index drivers_status_idx      on public.drivers(status);
create index drivers_web_visible_idx on public.drivers(web_visible) where web_visible = true;
create index drivers_deleted_at_idx  on public.drivers(deleted_at);

create trigger drivers_set_updated_at
  before update on public.drivers
  for each row execute function public.tg_set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.drivers enable row level security;

-- Lectura: cualquier usuario autenticado puede leer. La UI pública filtra
-- por web_visible cuando aplica.
create policy drivers_authenticated_read on public.drivers
  for select using (auth.uid() is not null);

-- Escritura: solo quien tenga transfers:write (o sea admin).
create policy drivers_write_with_permission on public.drivers
  for insert with check (public.fn_has_permission('transfers:write'));

create policy drivers_update_with_permission on public.drivers
  for update using (public.fn_has_permission('transfers:write'))
              with check (public.fn_has_permission('transfers:write'));

create policy drivers_delete_with_permission on public.drivers
  for delete using (public.fn_has_permission('transfers:write'));
