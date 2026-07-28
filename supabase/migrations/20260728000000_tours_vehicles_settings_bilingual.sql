-- ============================================================================
-- Bilingüe 100% del catálogo (PM 2026-07-28)
--
-- Cierra los últimos casos donde información editada por el admin no respetaba
-- el toggle ES/EN o se perdía al mostrarse en otro idioma:
--   1) Tour chips (perfect_for, highlights, includes) — antes 1 solo idioma
--   2) Vehicles (description, features)                — antes 1 solo idioma
--   3) Site setting `tagline`                          — antes 1 solo valor
--
-- Estrategia: arrays/campos paralelos `_es` / `_en` — mismo patrón que
-- title_es/en, experience_es/en, cancellation_policy_es/en. Los campos
-- legacy quedan para compat (el server lee _es/_en primero y cae al legacy
-- solo si están vacíos).
-- ============================================================================

-- ─── 1. Tour chips bilingües ────────────────────────────────────────────────
alter table public.tours
  add column if not exists perfect_for_es jsonb not null default '[]'::jsonb,
  add column if not exists perfect_for_en jsonb not null default '[]'::jsonb,
  add column if not exists highlights_es  jsonb not null default '[]'::jsonb,
  add column if not exists highlights_en  jsonb not null default '[]'::jsonb,
  add column if not exists includes_es    jsonb not null default '[]'::jsonb,
  add column if not exists includes_en    jsonb not null default '[]'::jsonb;

-- Backfill: copiar chips existentes a ambos slots. El admin editará el _en
-- después si quiere traducirlos. Sin este paso, tours ya cargados aparecerían
-- vacíos en el idioma activo.
update public.tours
   set perfect_for_es = case when jsonb_typeof(perfect_for) = 'array' then perfect_for else '[]'::jsonb end,
       perfect_for_en = case when jsonb_typeof(perfect_for) = 'array' then perfect_for else '[]'::jsonb end
 where (perfect_for_es = '[]'::jsonb or perfect_for_es is null)
   and perfect_for is not null;

update public.tours
   set highlights_es = case when jsonb_typeof(highlights) = 'array' then highlights else '[]'::jsonb end,
       highlights_en = case when jsonb_typeof(highlights) = 'array' then highlights else '[]'::jsonb end
 where (highlights_es = '[]'::jsonb or highlights_es is null)
   and highlights is not null;

update public.tours
   set includes_es = case when jsonb_typeof(includes) = 'array' then includes else '[]'::jsonb end,
       includes_en = case when jsonb_typeof(includes) = 'array' then includes else '[]'::jsonb end
 where (includes_es = '[]'::jsonb or includes_es is null)
   and includes is not null;

comment on column public.tours.perfect_for_es is 'Chips "Ideal para" en español.';
comment on column public.tours.perfect_for_en is 'Chips "Perfect for" in English.';
comment on column public.tours.highlights_es  is 'Chips "Destacados" en español.';
comment on column public.tours.highlights_en  is 'Chips "Highlights" in English.';
comment on column public.tours.includes_es    is 'Chips "Incluye" en español.';
comment on column public.tours.includes_en    is 'Chips "Included" in English.';

-- ─── 2. Vehicles bilingües ──────────────────────────────────────────────────
alter table public.vehicles
  add column if not exists description_es text,
  add column if not exists description_en text,
  add column if not exists features_es jsonb not null default '[]'::jsonb,
  add column if not exists features_en jsonb not null default '[]'::jsonb;

-- Backfill: mover contenido legacy al slot ES y copiar a EN.
update public.vehicles
   set description_es = coalesce(description_es, description),
       description_en = coalesce(description_en, description)
 where description is not null
   and (description_es is null or description_en is null);

update public.vehicles
   set features_es = case when jsonb_typeof(features) = 'array' then features else '[]'::jsonb end,
       features_en = case when jsonb_typeof(features) = 'array' then features else '[]'::jsonb end
 where (features_es = '[]'::jsonb or features_es is null)
   and features is not null;

comment on column public.vehicles.description_es is 'Descripción del vehículo en español (visible en el buscador de transfer).';
comment on column public.vehicles.description_en is 'Vehicle description in English (shown on the transfer search).';
comment on column public.vehicles.features_es is 'Chips de características del vehículo en español.';
comment on column public.vehicles.features_en is 'Vehicle feature chips in English.';

-- ─── 3. Site setting: tagline bilingüe ──────────────────────────────────────
-- No requiere alterar tabla: site_settings es key/value. Solo asegurar la
-- existencia de los dos nuevos keys. Si `tagline` (legacy) tenía valor, se
-- copia al slot ES por defecto; el admin luego edita el EN si quiere.
insert into public.site_settings (key, value)
select 'tagline_es', value
  from public.site_settings
 where key = 'tagline'
   and not exists (select 1 from public.site_settings where key = 'tagline_es');

insert into public.site_settings (key, value)
select 'tagline_en', value
  from public.site_settings
 where key = 'tagline'
   and not exists (select 1 from public.site_settings where key = 'tagline_en');

-- Si el legacy nunca se cargó, dejamos los dos keys vacíos para que el editor
-- los tenga listos.
insert into public.site_settings (key, value)
values ('tagline_es', ''), ('tagline_en', '')
on conflict (key) do nothing;
