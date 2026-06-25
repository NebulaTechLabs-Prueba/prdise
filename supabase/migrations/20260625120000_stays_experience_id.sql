-- ============================================================================
-- stays.experience_id — asociación a experiencias dinámicas
-- ============================================================================
--
-- PM 2026-06-25: el cliente pidió poder asociar tanto tours como stays a
-- experiencias. tours.experience_id ya quedó en la migración de hoy a
-- las 00:00; aquí extendemos lo mismo a stays.
--
-- FK ON DELETE SET NULL: si una experiencia se elimina, los stays asociados
-- pierden el link pero NO se borran.
-- ============================================================================

alter table public.stays
  add column if not exists experience_id uuid references public.experiences(id) on delete set null;

create index if not exists stays_experience_id_idx
  on public.stays(experience_id)
  where experience_id is not null;

comment on column public.stays.experience_id is
  'FK a experiences. NULL = sin asignar. Permite agrupar stays por experiencia en el Home/listado.';

-- ============================================================================
-- experiences.featured_on_home — admin elige qué mostrar en el Home
-- ============================================================================
--
-- PM 2026-06-25: el cliente pidió poder señalar qué experiencias aparecen
-- en el Home (máximo 3) o destacar como Featured. El cap visual lo hace
-- el front (LIMIT 3 por sort_order); aquí solo agregamos la flag.
-- ============================================================================

alter table public.experiences
  add column if not exists featured_on_home boolean not null default false;

create index if not exists experiences_featured_idx
  on public.experiences(featured_on_home, sort_order)
  where active = true and featured_on_home = true;

comment on column public.experiences.featured_on_home is
  'Si true, la experiencia aparece en la grilla principal del Home. El front limita a 3 por sort_order.';

-- Seed: marcar las 3 macro existentes como featured para no romper el Home.
update public.experiences
   set featured_on_home = true
 where slug in ('beach-escape','river-mountain','utv-west-coast');

