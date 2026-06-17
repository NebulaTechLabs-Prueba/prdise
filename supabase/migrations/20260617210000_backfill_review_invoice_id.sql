-- ============================================================================
-- Backfill: reviews.invoice_id para reviews legacy (creadas antes de la
-- migración 20260617200000 que añadió la columna)
-- ============================================================================
--
-- PM 2026-06-17: tras agregar reviews.invoice_id las reviews históricas
-- quedaron con NULL — pero por lógica del flujo (rateInvoice), TODA review
-- proviene de una factura calificada. El admin notó: "por logica para que
-- exista una review si o si debio primero existir un invoice".
--
-- Matcheamos cada review huérfana con la invoice de la que provino:
--   - Mismo user_id
--   - El invoice está calificado (rating IS NOT NULL)
--   - El invoice contiene un invoice_item con FK al mismo item (tour/stay/transfer)
--   - El timestamp de rated_at está cerca del created_at de la review
--     (±10 min para tolerar drift)
--
-- Si una review puede asociarse a varias facturas (caso muy raro), se queda
-- con la más cercana en el tiempo. Lo hacemos en un CTE.
-- ============================================================================

with candidates as (
  select
    r.id as review_id,
    i.id as invoice_id,
    abs(extract(epoch from (r.created_at - coalesce(i.rated_at, i.issued_at)))) as time_distance,
    row_number() over (
      partition by r.id
      order by abs(extract(epoch from (r.created_at - coalesce(i.rated_at, i.issued_at)))) asc
    ) as rn
  from public.reviews r
  join public.invoices i on i.user_id = r.user_id
  join public.invoice_items ii on ii.invoice_id = i.id
  where r.invoice_id is null
    and i.rating is not null
    and (
      (r.item_type::text = 'tour'     and ii.tour_id            = r.item_id) or
      (r.item_type::text = 'stay'     and ii.stay_id            = r.item_id) or
      (r.item_type::text = 'transfer' and ii.transfer_route_id  = r.item_id)
    )
    -- Ventana generosa de 30 min — el rated_at se setea al mismo tiempo que
    -- la review se inserta, así que en teoría es muy cercano. Generoso por si
    -- hubo drift de clock o el insert se demoró.
    and abs(extract(epoch from (r.created_at - coalesce(i.rated_at, i.issued_at)))) < 1800
)
update public.reviews r
set invoice_id = c.invoice_id
from candidates c
where c.review_id = r.id
  and c.rn = 1;
