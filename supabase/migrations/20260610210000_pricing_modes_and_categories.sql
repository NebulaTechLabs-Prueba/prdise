-- ============================================================================
-- 0019 — Pricing modes (mixed) + categorías para catálogo
-- ============================================================================
--
-- PM 2026-06-10:
--
--   1) Pricing mixto: hay tours y estadías cuyo precio NO es simplemente "por
--      persona" o "por noche". Ejemplos del cliente:
--        * Kayak guide: $50/hora Y $30/persona (mixto)
--        * ATV tour: $20/persona + atracciones add-on opcionales ($10 c/u)
--
--      Modelado:
--        * `pricing_unit`: enum-ish text ('per_person', 'per_hour',
--          'per_night', 'per_attraction', 'per_unit'). Es la unidad del
--          precio base.
--        * `pricing_extras`: jsonb array, cada extra es
--          { label_es, label_en, price_cents, unit }.
--          Si está vacío [], el servicio cobra solo el precio base.
--
--   2) Categorías: stays/tours necesitan agruparse para que el admin
--      reporte y filtre. Por ahora es free-text (sin tabla normalizada);
--      el form ofrece un datalist con valores ya usados.
-- ============================================================================

alter table public.stays
  add column if not exists pricing_unit text default 'per_night',
  add column if not exists pricing_extras jsonb not null default '[]'::jsonb,
  add column if not exists category text;

alter table public.tours
  add column if not exists pricing_unit text default 'per_person',
  add column if not exists pricing_extras jsonb not null default '[]'::jsonb,
  add column if not exists category text;

alter table public.transfer_routes
  add column if not exists pricing_unit text default 'per_unit';

-- Constraint suave (no enum hard porque queremos permitir custom labels
-- futuras). En la app validamos contra una whitelist conocida.
alter table public.stays
  add constraint stays_pricing_unit_check
  check (pricing_unit in ('per_night', 'per_person', 'per_hour', 'per_unit', 'per_attraction'));

alter table public.tours
  add constraint tours_pricing_unit_check
  check (pricing_unit in ('per_person', 'per_hour', 'per_unit', 'per_attraction', 'per_night'));

alter table public.transfer_routes
  add constraint transfer_routes_pricing_unit_check
  check (pricing_unit in ('per_unit', 'per_person', 'per_hour'));

-- Índices: el admin filtra por categoría y queremos contar tours por
-- categoría para el dashboard.
create index if not exists stays_category_idx on public.stays(category) where category is not null;
create index if not exists tours_category_idx on public.tours(category) where category is not null;

comment on column public.tours.pricing_unit is
  'Unidad del precio base: per_person | per_hour | per_unit | per_attraction | per_night.';
comment on column public.tours.pricing_extras is
  'Array de extras adicionales. Cada item: {label_es, label_en, price_cents, unit}.';
comment on column public.tours.category is
  'Categoría libre (free-text). Sin tabla normalizada para mantener flexibilidad.';
comment on column public.stays.pricing_unit is
  'Unidad del precio base. Default per_night.';
comment on column public.stays.pricing_extras is
  'Array de extras (mismo schema que tours.pricing_extras).';
comment on column public.transfer_routes.pricing_unit is
  'Unidad del precio base. Default per_unit (precio fijo por viaje).';
