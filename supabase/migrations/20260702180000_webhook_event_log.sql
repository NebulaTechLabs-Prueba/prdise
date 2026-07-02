-- ============================================================================
-- webhook_event_log — persistir cada intento del webhook para diagnóstico
-- ============================================================================
--
-- PM 2026-07-02: cliente reportó que el webhook de Stripe no está
-- actualizando facturas y quería ver la respuesta del sistema.
-- Persistimos cada request que llega al endpoint, con status HTTP
-- devuelto y snippet del payload (para no explotar tamaño en producción).
--
-- El admin puede consultarlos desde el panel para diagnosticar sin
-- necesidad de SSH ni acceso a logs de PM2.
-- ============================================================================

create table if not exists public.webhook_event_log (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                      -- 'stripe' | 'paypal'
  event_type text,                             -- ej 'checkout.session.completed'
  event_id text,                               -- ID del evento del provider (para dedupe)
  status_code int not null,                    -- HTTP devuelto por el handler
  outcome text not null,                       -- 'ok' | 'signature_invalid' | 'no_secret' | 'handler_error' | 'unhandled_type'
  message text,                                -- detalle libre (error, invoice_id encontrado, etc.)
  payload_snippet text,                        -- primeros ~1000 chars del body para debug
  invoice_id uuid references public.invoices(id) on delete set null,
  received_at timestamptz not null default now()
);

comment on table public.webhook_event_log is
  'Log de intentos de webhook (Stripe/PayPal) para diagnóstico. Persiste 30 días — job de limpieza opcional.';

create index if not exists webhook_event_log_received_at_idx
  on public.webhook_event_log (received_at desc);

create index if not exists webhook_event_log_provider_outcome_idx
  on public.webhook_event_log (provider, outcome, received_at desc);

-- RLS: solo admin puede leer. El handler del webhook usa admin client
-- (service_role) que bypasea RLS al insertar.
alter table public.webhook_event_log enable row level security;

drop policy if exists webhook_event_log_admin_read on public.webhook_event_log;
create policy webhook_event_log_admin_read on public.webhook_event_log
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Nadie escribe desde el cliente. El insert lo hace el handler con
-- service_role. No creamos policies for insert/update/delete.
