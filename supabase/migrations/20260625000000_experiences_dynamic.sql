-- ============================================================================
-- experiences: catálogo dinámico de experiencias (admin CRUD)
-- ============================================================================
--
-- PM 2026-06-25: el cliente pidió que las "experiencias" (que hoy son
-- 3 valores hardcoded en `tours.experience_category`) pasen a ser
-- gestionables desde el admin (crear / editar / eliminar). Cada tour se
-- asocia a UNA experiencia via FK.
--
-- Modelo:
--   experiences  (id, slug, name_es/en, desc_es/en, color, sort, active, cover)
--   tours.experience_id  → experiences.id (nullable; queda NULL si no asignó)
--
-- experience_category (text legacy) se MANTIENE temporalmente para no
-- romper código en vuelo; el backfill copia el slug y eventualmente se
-- puede dropear.
-- ============================================================================

create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_es text not null,
  name_en text not null,
  description_es text default '',
  description_en text default '',
  color text default 'gold',
  sort_order int not null default 100,
  active boolean not null default true,
  cover_image text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table  public.experiences is 'Catálogo dinámico de experiencias. Cada tour se asocia a una.';
comment on column public.experiences.slug  is 'Identificador estable para URLs (/tours?experience=beach-escape).';
comment on column public.experiences.color is 'Token visual: gold | sky | green | orange | etc. UI hace fallback a gold.';
comment on column public.experiences.cover_image is 'URL pública (Storage) o vacío para usar el cover del primer tour.';

-- Trigger para updated_at
create or replace function public.touch_experiences_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists experiences_touch on public.experiences;
create trigger experiences_touch
  before update on public.experiences
  for each row execute function public.touch_experiences_updated_at();

-- RLS: público puede SELECT (sólo activas); staff puede gestionar todo.
alter table public.experiences enable row level security;

drop policy if exists exp_select_public on public.experiences;
create policy exp_select_public on public.experiences
  for select using (active = true);

-- PM 2026-06-25: enum user_role solo tiene 'admin' y 'user' tras la
-- consolidación (migración 20260609180000). NO existe 'employee'.
drop policy if exists exp_select_staff on public.experiences;
create policy exp_select_staff on public.experiences
  for select to authenticated using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists exp_modify_admin on public.experiences;
create policy exp_modify_admin on public.experiences
  for all to authenticated using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  );

-- ── Seed: las 3 macro experiencias actuales pasan a rows ──────────────────
insert into public.experiences (slug, name_es, name_en, description_es, description_en, color, sort_order)
values
  ('beach-escape',    'Beach Escape',               'Beach Escape',
   'Playas espectaculares de aguas cristalinas: snorkel, jet ski, banana boat, relajación y paisajes costeros inolvidables.',
   'Discover spectacular beaches with crystal-clear waters, snorkeling, jet ski, banana boat, relaxation and unforgettable coastal scenery.',
   'sky', 10),
  ('river-mountain',  'River & Mountain Adventure', 'River & Mountain Adventure',
   'Ríos cristalinos, charcos naturales, cascadas y paisajes de montaña que dejan sin aliento.',
   'Explore crystal-clear rivers, natural pools, waterfalls, and breathtaking mountain scenery.',
   'green', 20),
  ('utv-west-coast',  'UTV Tours in West Coast',    'UTV Tours in West Coast',
   'Elegí cómo vivirlo: conducí tu propio UTV en convoy con guía, o viajá como pasajero mientras recorrés rutas costeras.',
   'Choose how you want to experience it – drive your own UTV in a guide convoy or ride along with a guide while exploring scenic coastal routes.',
   'orange', 30)
on conflict (slug) do nothing;

-- ── tours.experience_id FK ──────────────────────────────────────────────
alter table public.tours
  add column if not exists experience_id uuid references public.experiences(id) on delete set null;

create index if not exists tours_experience_id_idx
  on public.tours(experience_id)
  where experience_id is not null;

comment on column public.tours.experience_id is 'FK a experiences. Reemplaza experience_category. NULL = sin asignar.';

-- ── Backfill: mapear experience_category → experience_id ────────────────
update public.tours t
   set experience_id = e.id
  from public.experiences e
 where t.experience_id is null
   and (
        (t.experience_category = 'beach_escape'    and e.slug = 'beach-escape')
     or (t.experience_category = 'river_mountain'  and e.slug = 'river-mountain')
     or (t.experience_category = 'utv_west_coast'  and e.slug = 'utv-west-coast')
   );
