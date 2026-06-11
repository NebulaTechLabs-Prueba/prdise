-- ============================================================================
-- 0024 — Refactor transfers: vehicle FK en routes + multi-leg en bookings
-- ============================================================================
--
-- PM 2026-06-11:
--   "Para que una ruta exista, debe existir un vehiculo (con su maxima
--    capacidad de pasajeros y equipaje/carga) y los puntos de inicio/destino,
--    tal como ya esta se considera la fecha y hora, pero un servicio de
--    traslado puede tener N rutas."
--
-- Cambios:
--   1) vehicles.cargo_capacity — capacidad de equipaje/carga (unidades).
--   2) transfer_routes.vehicle_id — FK a vehicles. Nullable para no romper
--      rutas existentes; la UI exigirá vehículo al crear una nueva.
--   3) transfer_booking_legs — tramos adicionales (legs 2..N) de un servicio
--      de traslado. El primer tramo sigue viviendo en `bookings` (route_id +
--      vehicle_id + date/time) para no romper el constraint
--      `bookings_item_consistency`. Cada leg adicional tiene: vehículo +
--      2 puntos (texto libre para "Otro") + fecha/hora + pax + bags + notas.
-- ============================================================================

-- ─── 1) vehicles.cargo_capacity ────────────────────────────────────────────
alter table public.vehicles
  add column if not exists cargo_capacity integer not null default 0
    check (cargo_capacity >= 0 and cargo_capacity <= 50);

comment on column public.vehicles.cargo_capacity is
  'Capacidad máxima de maletas/carga (unidades). 0 = no soportado / no aplica.';

-- ─── 2) transfer_routes.vehicle_id ─────────────────────────────────────────
alter table public.transfer_routes
  add column if not exists vehicle_id uuid
    references public.vehicles(id) on delete set null;

create index if not exists transfer_routes_vehicle_idx
  on public.transfer_routes(vehicle_id) where vehicle_id is not null;

comment on column public.transfer_routes.vehicle_id is
  'Vehículo asignado a esta ruta-template (admin lo elige al crear). NULL en rutas legacy; nuevas requieren vehículo desde la UI.';

-- ─── 3) transfer_booking_legs (legs 2..N) ──────────────────────────────────
create table if not exists public.transfer_booking_legs (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  leg_order       integer not null default 2 check (leg_order >= 2),
  -- Puntos como texto para soportar "Otro" libre. Si vienen del catálogo,
  -- guardamos la etiqueta visible (no FK porque transfer_locations es
  -- editable y queremos congelar el snapshot histórico).
  from_point      text not null,
  to_point        text not null,
  -- Vehículo asignado al tramo.
  vehicle_id      uuid references public.vehicles(id) on delete set null,
  -- Referencia opcional a un template (para reuso de pricing).
  route_template_id uuid references public.transfer_routes(id) on delete set null,
  scheduled_date  date,
  scheduled_time  time,
  pax             integer not null default 1 check (pax > 0 and pax <= 60),
  bags            integer not null default 0 check (bags >= 0 and bags <= 60),
  price_cents     integer not null default 0 check (price_cents >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists transfer_booking_legs_booking_idx
  on public.transfer_booking_legs(booking_id, leg_order);

create trigger transfer_booking_legs_set_updated_at
  before update on public.transfer_booking_legs
  for each row execute function public.tg_set_updated_at();

comment on table public.transfer_booking_legs is
  'Tramos adicionales (legs 2..N) de un servicio de traslado. El leg 1 vive en bookings (route + vehicle + date/time). Permite multi-leg sin romper el constraint bookings_item_consistency.';

alter table public.transfer_booking_legs enable row level security;

-- RLS: el dueño del booking ve sus tramos; staff ve todo.
create policy tbl_select_self_or_staff on public.transfer_booking_legs
  for select using (
    public.fn_is_staff()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = auth.uid()
    )
  );

create policy tbl_insert_staff_or_owner on public.transfer_booking_legs
  for insert with check (
    public.fn_is_staff()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = auth.uid()
    )
  );

create policy tbl_update_staff_or_owner on public.transfer_booking_legs
  for update using (
    public.fn_is_staff()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = auth.uid()
    )
  ) with check (
    public.fn_is_staff()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = auth.uid()
    )
  );

create policy tbl_delete_staff on public.transfer_booking_legs
  for delete using (public.fn_is_staff());
