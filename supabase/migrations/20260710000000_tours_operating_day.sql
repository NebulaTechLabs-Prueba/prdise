-- ============================================================================
-- tours.operating_day — día(s) en que se ofrece el tour
-- ============================================================================
--
-- PM 2026-07-10: el editor del admin tenía un input "Day" desde el scaffold
-- inicial pero nunca se conectó a DB. Se llenaba y se perdía. Cliente
-- reportó "los cambios no se reflejan" — parte de la confusión venía de
-- este campo huérfano.
--
-- El propósito editorial es indicar cuándo se ofrece el tour (ejemplo
-- "Sábados", "Fines de semana", "Todos los días", "Solo martes y jueves").
-- Texto libre — el admin lo escribe como quiera que lo vea el visitante.
-- ============================================================================

alter table public.tours
  add column if not exists operating_day text;

comment on column public.tours.operating_day is
  'Día(s) en que se ofrece el tour. Texto libre (ej. "Sábados", "Fines de semana", "Todos los días"). Se muestra en la ficha pública.';
