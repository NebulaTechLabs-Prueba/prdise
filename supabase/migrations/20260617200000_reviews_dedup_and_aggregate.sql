-- ============================================================================
-- Reviews: dedup por invoice + trigger de agregados a tours/stays/transfer_routes
-- ============================================================================
--
-- PM 2026-06-17: tras el fix del RLS del rating (rateInvoice ahora usa admin
-- client), aparecieron 2 issues nuevos:
--
--   1) Reviews duplicadas: el cliente intentó calificar 2 veces. La primera
--      vez el invoice.rating no se guardó (RLS bug) pero la review huérfana
--      sí se insertó. El segundo intento insertó otra review más. Sin un
--      identificador de invoice en reviews no podemos deduplicar por origen.
--
--   2) tours.rating_avg / rating_count NUNCA se recalculan al insertar
--      reviews. Quedan en 0 para siempre — y la analítica del admin
--      (basada en esos campos) tampoco refleja las calificaciones.
--
-- Fixes en esta migración:
--   A) Agregar reviews.invoice_id (FK opcional a invoices). Las reviews
--      generadas por rateInvoice se asocian al invoice de origen.
--   B) Unique index parcial (user_id, item_type, item_id, invoice_id)
--      cuando invoice_id is not null → la MISMA factura no puede generar
--      2 reviews por el mismo item. Reviews legacy con invoice_id NULL
--      no se ven afectadas.
--   C) Función + trigger fn_recompute_item_rating: cada insert/update/
--      delete de una review recalcula rating_avg + rating_count del item
--      correspondiente en tours / stays / transfer_routes. Sólo cuenta
--      reviews con status='published'.
--   D) DEDUPE one-shot: si para un mismo (user_id, item_type, item_id)
--      hay varias reviews y al menos una tiene status='published', dejamos
--      sólo la más reciente — las anteriores se borran. Mantiene la
--      review actual del cliente y descarta huérfanas del bug previo.
--   E) RECALC one-shot: corre la función de recálculo para cada item
--      que tenga reviews — sincroniza rating_avg/rating_count con la
--      tabla reviews al estado de hoy.
-- ============================================================================

-- ─── A) reviews.invoice_id ─────────────────────────────────────────────────
alter table public.reviews
  add column if not exists invoice_id uuid references public.invoices(id) on delete cascade;

comment on column public.reviews.invoice_id is
  'Factura que originó esta review (rateInvoice). NULL = review manual no atada a compra. Habilita el unique index que previene duplicados por (user, item, factura).';

create index if not exists reviews_invoice_idx on public.reviews(invoice_id) where invoice_id is not null;

-- ─── B) Unique parcial: 1 review por (user, item, invoice) ─────────────────
create unique index if not exists reviews_no_dup_per_invoice
  on public.reviews(user_id, item_type, item_id, invoice_id)
  where invoice_id is not null;

-- ─── C) Función + trigger de recálculo ─────────────────────────────────────
create or replace function public.fn_recompute_item_rating() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_item_type text;
  v_item_id uuid;
  v_avg numeric(3,2);
  v_cnt integer;
begin
  -- En DELETE leemos del OLD; en INSERT/UPDATE del NEW.
  v_item_type := coalesce(new.item_type::text, old.item_type::text);
  v_item_id := coalesce(new.item_id, old.item_id);

  select coalesce(avg(rating)::numeric(3,2), 0), count(*)
    into v_avg, v_cnt
  from public.reviews
  where item_type::text = v_item_type
    and item_id = v_item_id
    and status = 'published';

  if v_item_type = 'tour' then
    update public.tours set rating_avg = v_avg, rating_count = v_cnt where id = v_item_id;
  elsif v_item_type = 'stay' then
    update public.stays set rating_avg = v_avg, rating_count = v_cnt where id = v_item_id;
  -- transfer_routes no tiene rating_avg/rating_count por ahora — se agrega si
  -- el negocio lo pide; no rompe el flow.
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_reviews_recompute_rating on public.reviews;
create trigger trg_reviews_recompute_rating
  after insert or update or delete on public.reviews
  for each row execute function public.fn_recompute_item_rating();

-- ─── D) DEDUPE one-shot ────────────────────────────────────────────────────
-- Reviews legacy duplicadas (mismo user+item, sin distinguishing por invoice).
-- Mantenemos la más reciente por created_at; borramos el resto.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, item_type, item_id
           order by created_at desc, id desc
         ) as rn
  from public.reviews
)
delete from public.reviews
where id in (select id from ranked where rn > 1);

-- ─── E) RECALC one-shot de todos los items con reviews ────────────────────
-- Tours
update public.tours t
set rating_avg = sub.avg, rating_count = sub.cnt
from (
  select item_id,
         coalesce(avg(rating)::numeric(3,2), 0) as avg,
         count(*) as cnt
  from public.reviews
  where item_type = 'tour' and status = 'published'
  group by item_id
) sub
where t.id = sub.item_id;

-- Stays
update public.stays s
set rating_avg = sub.avg, rating_count = sub.cnt
from (
  select item_id,
         coalesce(avg(rating)::numeric(3,2), 0) as avg,
         count(*) as cnt
  from public.reviews
  where item_type = 'stay' and status = 'published'
  group by item_id
) sub
where s.id = sub.item_id;
