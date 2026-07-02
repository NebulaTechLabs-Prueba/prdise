-- ============================================================================
-- payment_provider_configs — separar claves TEST y LIVE de Stripe
-- ============================================================================
--
-- PM 2026-07-02: el cliente rotó las keys en reunión y ahora nos pasó
-- también las llaves TEST. Antes solo teníamos 3 columnas para Stripe
-- (publishable_key, secret_key, webhook_secret) → al cambiar el `mode`
-- de "live" a "test" había que borrar y volver a pegar todo, o guardarlo
-- en un bloc de notas paralelo.
--
-- Ahora persistimos ambos sets en columnas separadas, y `mode` decide
-- cuál se usa en runtime. El admin puede alternar el switch sin perder
-- ningún valor.
--
-- Backfill: las columnas legacy `publishable_key/secret_key/webhook_secret`
-- se copian al slot que corresponda según el `mode` actual, y se dejan
-- como fallback si un slot nuevo está vacío (compat con configs viejas).
-- ============================================================================

alter table public.payment_provider_configs
  add column if not exists publishable_key_test text,
  add column if not exists secret_key_test      text,
  add column if not exists webhook_secret_test  text,
  add column if not exists publishable_key_live text,
  add column if not exists secret_key_live      text,
  add column if not exists webhook_secret_live  text;

comment on column public.payment_provider_configs.publishable_key_test
  is 'Stripe publishable key en modo TEST (pk_test_...).';
comment on column public.payment_provider_configs.secret_key_test
  is 'Stripe secret key en modo TEST (sk_test_...).';
comment on column public.payment_provider_configs.webhook_secret_test
  is 'Stripe webhook signing secret en modo TEST (whsec_...).';
comment on column public.payment_provider_configs.publishable_key_live
  is 'Stripe publishable key en modo LIVE (pk_live_...).';
comment on column public.payment_provider_configs.secret_key_live
  is 'Stripe secret key en modo LIVE (sk_live_...).';
comment on column public.payment_provider_configs.webhook_secret_live
  is 'Stripe webhook signing secret en modo LIVE (whsec_...).';

-- Backfill: mover las keys existentes al slot que corresponda según `mode`.
-- Si mode='live', las keys legacy se copian a las columnas _live. Si es
-- 'test', a _test. Las columnas legacy se conservan como fallback por
-- compat, no se borran.
update public.payment_provider_configs
   set publishable_key_live = coalesce(publishable_key_live, publishable_key),
       secret_key_live      = coalesce(secret_key_live, secret_key),
       webhook_secret_live  = coalesce(webhook_secret_live, webhook_secret)
 where provider = 'stripe' and mode = 'live';

update public.payment_provider_configs
   set publishable_key_test = coalesce(publishable_key_test, publishable_key),
       secret_key_test      = coalesce(secret_key_test, secret_key),
       webhook_secret_test  = coalesce(webhook_secret_test, webhook_secret)
 where provider = 'stripe' and mode = 'test';
