-- ============================================================================
-- stays: agregar columnas stay_type + stars
-- ============================================================================
--
-- PM 2026-07-09: el editor del admin ya tenía inputs para "Type"
-- (Villa/Apartment/…) y "Stars" (1–5), pero NO estaban conectados a DB
-- — se editaban en el UI pero al guardar se perdían. Ahora se persisten.
--
-- - stay_type: text libre. Sugerencias en el UI (Villa, Apartment, Cabin,
--   Loft, etc.) pero el admin puede crear el que necesite.
-- - stars: smallint 1–5. Es la clasificación estelar autopublicada del
--   stay, distinta de rating_avg que se calcula desde reseñas de clientes.
-- ============================================================================

alter table public.stays
  add column if not exists stay_type text,
  add column if not exists stars smallint check (stars is null or (stars >= 1 and stars <= 5));

comment on column public.stays.stay_type is
  'Tipo del alojamiento (Villa, Apartment, Cabin, Loft, etc.). Texto libre — el admin puede crear tipos custom.';
comment on column public.stays.stars is
  'Clasificación estelar 1-5 autopublicada por el admin. Distinta de rating_avg (calculada desde reseñas).';
