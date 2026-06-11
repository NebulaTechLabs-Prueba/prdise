-- ============================================================================
-- 0020 — Stays policies editables + transfer_locations (CRUD desde admin)
-- ============================================================================
--
-- PM 2026-06-11:
--
--   1) Cuando se crea un stay, no había forma de definir políticas (entrada,
--      salida, cancelación, normas de la casa). El detail page mostraba un
--      texto hardcoded. Ahora las políticas se persisten en la tabla `stays`.
--
--   2) Los desplegables "Desde" y "Hasta" del buscador de traslados estaban
--      hardcoded en el JSX. El admin no podía agregar/editar/eliminar puntos
--      de recogida o destino. Nueva tabla `transfer_locations` alimenta los
--      dropdowns y permite el CRUD desde el panel.
-- ============================================================================

-- ─── 1) Políticas en stays ─────────────────────────────────────────────────
alter table public.stays
  add column if not exists check_in_time         text default '3:00 PM',
  add column if not exists check_out_time        text default '11:00 AM',
  add column if not exists cancellation_policy   text,
  add column if not exists house_rules           text;

comment on column public.stays.check_in_time is
  'Hora de check-in (formato libre, ej. "3:00 PM"). Mostrado en el detail page público.';
comment on column public.stays.check_out_time is
  'Hora de check-out. Mostrado en el detail page público.';
comment on column public.stays.cancellation_policy is
  'Política de cancelación bilingüe (text). Si NULL, se omite del detail page.';
comment on column public.stays.house_rules is
  'Reglas de la casa (mascotas, fumar, depósito, etc.). Texto libre.';

-- ─── 2) transfer_locations ──────────────────────────────────────────────────
create table if not exists public.transfer_locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                  -- key interna (slug, ej. "sju")
  label_es    text not null,                  -- "SJU Airport"
  label_en    text not null,                  -- "SJU Airport"
  active      boolean not null default true,
  sort_order  integer not null default 100,   -- para controlar el orden de aparición
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (name)
);

create index if not exists transfer_locations_active_idx
  on public.transfer_locations(active, sort_order) where active = true;

create trigger transfer_locations_set_updated_at
  before update on public.transfer_locations
  for each row execute function public.tg_set_updated_at();

alter table public.transfer_locations enable row level security;

-- Read público: el buscador de transfers (sin auth) necesita ver los puntos.
create policy transfer_locations_public_read on public.transfer_locations
  for select using (active = true or public.fn_is_staff());

create policy transfer_locations_staff_write on public.transfer_locations
  for all using (public.fn_is_staff()) with check (public.fn_is_staff());

-- Seed con los puntos que tenía hardcoded el JSX para no romper la UX actual.
insert into public.transfer_locations (name, label_es, label_en, sort_order) values
  ('sju',        'SJU Airport',  'SJU Airport',  10),
  ('bqn',        'BQN Airport',  'BQN Airport',  20),
  ('san_juan',   'San Juan Hotel', 'San Juan Hotel', 30),
  ('ponce',      'Ponce',        'Ponce',        40),
  ('rincon',     'Rincón',       'Rincón',       50),
  ('other',      'Otro',         'Other',        99)
on conflict (name) do nothing;
