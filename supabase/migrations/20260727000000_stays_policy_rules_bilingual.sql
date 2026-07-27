-- ============================================================================
-- stays: separar policy + rules en ES/EN
-- ============================================================================
--
-- PM 2026-07-27: la empleada reportó que al escribir en la pestaña ES de
-- "Política de cancelación" y "Normas de la casa", el valor se ve también
-- en la pestaña EN. Causa: eran un solo campo (cancellation_policy,
-- house_rules), no bilingües.
--
-- Ahora se bifurcan. Las columnas viejas se mantienen como fallback por
-- compat con datos existentes; el server las lee si las nuevas están
-- vacías. En el próximo commit se puede backfillear ES desde la vieja.
-- ============================================================================

alter table public.stays
  add column if not exists cancellation_policy_es text,
  add column if not exists cancellation_policy_en text,
  add column if not exists house_rules_es text,
  add column if not exists house_rules_en text;

comment on column public.stays.cancellation_policy_es is
  'Política de cancelación (español). Se muestra a visitantes en modo ES.';
comment on column public.stays.cancellation_policy_en is
  'Cancellation policy (English). Shown to visitors in EN mode.';
comment on column public.stays.house_rules_es is
  'Normas de la casa (español). Se muestra a visitantes en modo ES.';
comment on column public.stays.house_rules_en is
  'House rules (English). Shown to visitors in EN mode.';

-- Backfill: mover el valor legacy al slot ES (asumimos que el contenido
-- histórico estaba en español). El admin puede después llenar el EN.
update public.stays
   set cancellation_policy_es = coalesce(cancellation_policy_es, cancellation_policy)
 where cancellation_policy is not null
   and cancellation_policy <> '';

update public.stays
   set house_rules_es = coalesce(house_rules_es, house_rules)
 where house_rules is not null
   and house_rules <> '';
