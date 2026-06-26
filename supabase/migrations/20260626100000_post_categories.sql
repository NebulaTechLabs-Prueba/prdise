-- ============================================================================
-- post_categories: catálogo dinámico de categorías de publicaciones
-- ============================================================================
--
-- PM 2026-06-26: las categorías de posts (Season, Travel Advisory, etc.)
-- estaban hardcoded en JSX. Ahora el admin las gestiona desde un sub-tab
-- dentro de Publicaciones.
--
-- Modelo:
--   - posts.category sigue siendo TEXT (para no romper posts existentes).
--   - post_categories.slug se matchea contra posts.category (lookup por slug).
--   - admin CRUD desde el sub-tab "Categorías" dentro de Publicaciones.
-- ============================================================================

create table if not exists public.post_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_es text not null,
  name_en text not null,
  color text default '#F5A623',
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table  public.post_categories is 'Catálogo dinámico de categorías de posts. posts.category guarda el slug.';
comment on column public.post_categories.slug is 'Identificador estable. posts.category debe matchear este valor.';
comment on column public.post_categories.color is 'Color HEX para el badge en blog y admin (ej. #F5A623).';

-- Trigger updated_at
create or replace function public.touch_post_categories_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists post_categories_touch on public.post_categories;
create trigger post_categories_touch
  before update on public.post_categories
  for each row execute function public.touch_post_categories_updated_at();

-- RLS: público lee solo activas; admin gestiona todo.
alter table public.post_categories enable row level security;

drop policy if exists postcat_select_public on public.post_categories;
create policy postcat_select_public on public.post_categories
  for select using (active = true);

drop policy if exists postcat_select_staff on public.post_categories;
create policy postcat_select_staff on public.post_categories
  for select to authenticated using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists postcat_modify_admin on public.post_categories;
create policy postcat_modify_admin on public.post_categories
  for all to authenticated using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  );

-- Seed: 7 categorías que ya estaban hardcoded en JSX.
insert into public.post_categories (slug, name_es, name_en, color, sort_order)
values
  ('Season',           'Temporada',         'Season',           '#F5A623',  10),
  ('Travel Advisory',  'Aviso de viaje',    'Travel Advisory',  '#29ABE2',  20),
  ('Local Event',      'Evento local',      'Local Event',      '#8DC63F',  30),
  ('Tips',             'Tips',              'Tips',             '#EF6C2B',  40),
  ('Guide',            'Guía',              'Guide',            '#B794F4',  50),
  ('Food',             'Comida',            'Food',             '#F687B3',  60),
  ('Culture',          'Cultura',           'Culture',          '#4FD1C5',  70)
on conflict (slug) do nothing;
