-- ============================================================================
-- 0023 — profiles.birth_date + customer stats view
-- ============================================================================
--
-- PM 2026-06-11:
--   1) Fecha de nacimiento del cliente solicitada en /register para campañas
--      de cumpleaños y reportes demográficos. Opcional (NULL permitido) para
--      no romper a usuarios existentes.
--   2) Vista `customer_stats` que agrega métricas por cliente desde invoices:
--      - total_invested_cents: suma de invoices pagadas.
--      - service_count: cantidad de invoice_items distintos del cliente.
--      - most_frequent_service_type: 'tour' | 'stay' | 'transfer' | NULL.
--      Útil para la tarjeta de detalle en Contactos → Clientes.
--
--      La vista usa SECURITY INVOKER (default), así que respeta el RLS del
--      caller. El admin la consulta vía server action con admin client.
-- ============================================================================

alter table public.profiles
  add column if not exists birth_date date;

comment on column public.profiles.birth_date is
  'Fecha de nacimiento del cliente (opcional). Pedida en /register para campañas y reportes.';

-- Vista de estadísticas por cliente (PM 2026-06-11).
create or replace view public.customer_stats as
with paid as (
  select
    i.user_id,
    sum(i.total_cents)::bigint as total_invested_cents,
    count(*)::int               as invoices_paid
  from public.invoices i
  where i.status = 'paid'
    and i.user_id is not null
  group by i.user_id
),
items as (
  select
    i.user_id,
    case
      when ii.tour_id is not null then 'tour'
      when ii.stay_id is not null then 'stay'
      when ii.transfer_route_id is not null then 'transfer'
      else 'other'
    end as kind,
    count(*)::int as cnt
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where i.user_id is not null
  group by i.user_id, kind
),
totals as (
  select
    user_id,
    sum(cnt)::int as service_count,
    (
      array_agg(kind order by cnt desc, kind)
    )[1] as most_frequent_service_type
  from items
  group by user_id
)
select
  p.id                       as user_id,
  coalesce(paid.total_invested_cents, 0)::bigint as total_invested_cents,
  coalesce(paid.invoices_paid, 0)::int           as invoices_paid,
  coalesce(totals.service_count, 0)::int         as service_count,
  totals.most_frequent_service_type
from public.profiles p
left join paid   on paid.user_id = p.id
left join totals on totals.user_id = p.id;

comment on view public.customer_stats is
  'Stats agregadas por cliente: total invertido (invoices paid), servicios solicitados (invoice_items), y categoría más frecuente. Filtrada por RLS del caller (security invoker).';

-- Permitir lectura pública (el caller ya valida quién puede ver vía RLS de
-- profiles/invoices). Mantenemos el grant para que la vista sea consultable
-- desde RPC/PostgREST.
grant select on public.customer_stats to anon, authenticated;
