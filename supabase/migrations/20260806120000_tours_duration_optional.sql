-- ============================================================================
-- tours: permitir duración 0 (tours sin duración fija)
-- ============================================================================
--
-- PM 2026-08-06: la empleada reportó que el tour "Marina Pony Ride" no se
-- guardaba. Error de DB:
--
--   new row for relation "tours" violates check constraint
--   "tours_duration_minutes_check"
--
-- La migración original (20260511120002_business_domain.sql, línea 51) creó:
--
--   duration_minutes integer not null check (duration_minutes > 0)
--
-- El código app ya se ajustó para enviar 0 cuando el admin no define una
-- duración (paseo corto, evento con horario libre, etc.). Pero el CHECK
-- lo rechaza. Esta migración relaja la restricción a `>= 0`, manteniendo
-- NOT NULL para no romper joins/consultas que asumen valor presente.
--
-- 0 = "sin duración definida". El render público oculta el chip cuando
-- duration_minutes es 0 (PrdiseApp.jsx línea 4317).
-- ============================================================================

alter table public.tours
  drop constraint if exists tours_duration_minutes_check;

alter table public.tours
  add constraint tours_duration_minutes_check
  check (duration_minutes >= 0);

comment on constraint tours_duration_minutes_check on public.tours is
  'Permite duration_minutes >= 0. Valor 0 significa "sin duración fija" — el render público oculta el chip de duración en ese caso.';
