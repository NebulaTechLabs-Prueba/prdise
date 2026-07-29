-- ============================================================================
-- Bilingüe del campo "Día(s) de operación" del tour (PM 2026-07-28).
--
-- La empleada reportó: "en cuanto a los 'días' se queda en el idioma que lo
-- escribas". Antes existía una sola columna `operating_day` (texto libre). Ahora
-- se agregan variantes _es / _en siguiendo el mismo patrón que experience_es/en,
-- important_notes_es/en, etc. Legacy queda como fallback si _es/_en están vacíos.
-- ============================================================================

alter table public.tours
  add column if not exists operating_day_es text,
  add column if not exists operating_day_en text;

-- Backfill: copiar el valor legacy al slot ES (asumimos que fue cargado en ES
-- o texto genérico). El admin puede editar el EN luego desde el panel.
update public.tours
   set operating_day_es = coalesce(operating_day_es, operating_day)
 where operating_day is not null
   and operating_day_es is null;

comment on column public.tours.operating_day_es is
  'Día(s) de operación del tour en español (ej. "Lunes a domingo"). Aparece en la ficha pública.';
comment on column public.tours.operating_day_en is
  'Days the tour operates in English (e.g., "Monday to Sunday"). Shown on the public tour page.';
