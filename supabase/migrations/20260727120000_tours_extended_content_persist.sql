-- ============================================================================
-- tours: persistir contenido extendido (Experience, Notes, Perfect For,
-- Highlights). Antes vivía solo en memoria del navegador y se perdía al
-- refrescar. Reportado por el PM en 2026-07-27.
-- ============================================================================
--
-- Campos afectados:
--   experience_es/_en:      Descripción larga de la experiencia (bilingüe)
--   important_notes_es/_en: Notas destacadas para el visitante (bilingüe)
--   perfect_for:            Array de chips ("Amantes de la playa", etc.)
--   highlights:             Array de chips destacados
--
-- Note: los chips son bilingüe-agnósticos (son etiquetas cortas). Si en
-- el futuro se necesita bilingüe, se refactoriza a `[{es, en}, ...]`.
-- ============================================================================

alter table public.tours
  add column if not exists experience_es text,
  add column if not exists experience_en text,
  add column if not exists important_notes_es text,
  add column if not exists important_notes_en text,
  add column if not exists perfect_for jsonb not null default '[]'::jsonb,
  add column if not exists highlights jsonb not null default '[]'::jsonb;

comment on column public.tours.experience_es is
  'Descripción extendida de la experiencia (español). Aparece en la ficha pública del tour.';
comment on column public.tours.experience_en is
  'Extended description of the experience (English). Shown on the public tour page.';
comment on column public.tours.important_notes_es is
  'Notas importantes para el visitante (español). Aparecen destacadas en la ficha pública.';
comment on column public.tours.important_notes_en is
  'Important notes for the visitor (English). Shown highlighted on the public page.';
comment on column public.tours.perfect_for is
  'Array de chips describiendo el público ideal ("Amantes de la playa", "Familias", etc.).';
comment on column public.tours.highlights is
  'Array de chips con los momentos destacados del tour.';
