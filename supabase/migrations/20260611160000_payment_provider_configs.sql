-- ============================================================================
-- 0022 — Payment provider configs (Stripe / PayPal) editables desde admin
-- ============================================================================
--
-- PM 2026-06-11: hasta ahora Stripe se configuraba solo via env vars y PayPal
-- no estaba. La pantalla "Servicios conectados" mostraba "Próximamente" en
-- todo. Esta tabla permite al admin guardar la configuración de cada
-- proveedor desde el panel.
--
-- RLS: admin-only para todo. Estas keys NO son públicas — incluso la
-- publishable_key se sirve por server action si el admin la habilita en
-- páginas que la necesiten.
-- ============================================================================

create table if not exists public.payment_provider_configs (
  provider          text primary key check (provider in ('stripe', 'paypal')),
  enabled           boolean not null default false,
  mode              text not null default 'test' check (mode in ('test', 'live')),
  -- Stripe
  publishable_key   text,
  secret_key        text,
  webhook_secret    text,
  connected_account_id text,
  -- PayPal
  client_id         text,
  client_secret     text,
  account_email     text,
  -- Comunes
  default_currency  text default 'USD',
  configured_at     timestamptz,
  configured_by     uuid references public.profiles(id) on delete set null,
  updated_at        timestamptz not null default now()
);

comment on table public.payment_provider_configs is
  'Configuración de proveedores de pago (Stripe/PayPal). Editable solo por admin. Las server actions de invoices priorizan este registro sobre las env vars.';

create trigger payment_provider_configs_set_updated_at
  before update on public.payment_provider_configs
  for each row execute function public.tg_set_updated_at();

alter table public.payment_provider_configs enable row level security;

create policy ppc_admin_select on public.payment_provider_configs
  for select using (public.fn_is_admin());

create policy ppc_admin_insert on public.payment_provider_configs
  for insert with check (public.fn_is_admin());

create policy ppc_admin_update on public.payment_provider_configs
  for update using (public.fn_is_admin()) with check (public.fn_is_admin());

-- Filas vacías iniciales para que la UI no tenga que hacer upserts a ciegas.
insert into public.payment_provider_configs (provider, enabled, mode)
values ('stripe', false, 'test'), ('paypal', false, 'test')
on conflict (provider) do nothing;
