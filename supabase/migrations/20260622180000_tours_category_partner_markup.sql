-- ============================================================================
-- tours: nueva clasificación por experiencia + partner + markup configurable
-- ============================================================================
--
-- PM 2026-06-22: el review del cliente pide reorganizar la sección de tours
-- del Home en 3 grandes categorías de experiencia. Cada tour pasa a tener:
--
--   - experience_category  : a cuál de las 3 grandes experiencias pertenece
--                            ('beach_escape' | 'river_mountain' | 'utv_west_coast'
--                             | NULL si todavía no se clasificó). El nombre
--                            evita chocar con el campo libre `category` que
--                            vive sólo en UI (Adventure/Cultural/Boat).
--   - partner_name         : nombre del colaborador real al que pertenece el
--                            tour (Barra Salada, Pintos R Us, Parguera
--                            Watersports, Katarina Sail Charters, Aventoura,
--                            etc.). Texto libre porque ya existe
--                            public.partners pero no todos los tours están
--                            atados a un partner row — facilita el render
--                            agrupado sin forzar refactor de FKs ahora.
--   - markup_pct           : % sobre el precio del colaborador que cobramos
--                            al cliente final. Default 10. Se preserva por
--                            servicio para que excepciones (ej. Tanamá Full
--                            Day = 20%) no requieran hardcoded.
--
-- `experience_category` no es enum nativo para evitar churn en migraciones
-- futuras si el cliente quiere agregar/renombrar categorías. Se valida con
-- CHECK constraint que se puede modificar fácil.
-- ============================================================================

alter table public.tours
  add column if not exists experience_category text,
  add column if not exists partner_name text,
  add column if not exists markup_pct numeric(5,2) default 10 not null;

-- Sanitiza valores fuera del set permitido por si una corrida previa dejó algo.
update public.tours
   set experience_category = null
 where experience_category is not null
   and experience_category not in ('beach_escape','river_mountain','utv_west_coast');

alter table public.tours
  drop constraint if exists tours_experience_category_chk;
alter table public.tours
  add constraint tours_experience_category_chk
  check (experience_category is null or experience_category in ('beach_escape','river_mountain','utv_west_coast'));

comment on column public.tours.experience_category is
  'Categoría de experiencia del tour. NULL = sin clasificar. Valores: beach_escape, river_mountain, utv_west_coast. El Home agrupa por este campo.';
comment on column public.tours.partner_name is
  'Nombre del colaborador (ej. Barra Salada, Aventoura). Texto libre. Se usa para agrupar tours en la vista por categoría.';
comment on column public.tours.markup_pct is
  'Porcentaje sobre el precio del colaborador que se cobra al cliente final. Default 10. Excepciones (ej. Tanamá) usan 20.';

-- Índice para que el filtro WHERE experience_category = X sea barato en /tours.
create index if not exists tours_experience_category_idx
  on public.tours(experience_category)
  where experience_category is not null;
