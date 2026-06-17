-- ============================================================================
-- invoices.rating_comment — comentario del cliente junto al rating
-- ============================================================================
--
-- PM 2026-06-17: el cliente puede dejar un comentario opcional cuando
-- califica una factura. Antes solo se replicaba a `reviews.body` por cada
-- item del catálogo — el admin tenía que joinear reviews para verlo.
-- Agregar la columna directamente en invoices simplifica el viewer del
-- admin (lo lee del mismo row, sin join extra).
-- ============================================================================

alter table public.invoices
  add column if not exists rating_comment text;

comment on column public.invoices.rating_comment is
  'Comentario opcional del cliente al calificar la factura. NULL = no escribió comentario. Replicado en reviews.body por cada item del invoice para SEO/visibilidad pública.';
