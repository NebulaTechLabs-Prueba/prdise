-- ============================================================================
-- 0025 — Calificación del cliente por factura (1-5 estrellas)
-- ============================================================================
--
-- PM 2026-06-11: el cliente califica UNA sola vez por factura pagada, en
-- escala 1-5. Esa misma puntuación se propaga a todos los servicios
-- (tour/stay/transfer) que la factura contenga: si una invoice incluye
-- 1 tour + 1 stay y el cliente da 4★, ambos servicios reciben 4★.
--
-- Implementación:
--   * invoices.rating + rated_at: registran la calificación a nivel factura.
--   * Server action `rateInvoice` valida que la factura está pagada y es
--     del usuario logueado, e inserta entradas en `reviews` (status
--     'published' — auto-aprobada por estar anclada a una compra real)
--     para cada item con FK a tour/stay/transfer_route. Una invoice solo
--     puede calificarse una vez (UNIQUE no es estricto en DB pero el
--     server lo bloquea).
-- ============================================================================

alter table public.invoices
  add column if not exists rating    integer check (rating between 1 and 5),
  add column if not exists rated_at  timestamptz;

comment on column public.invoices.rating is
  'Calificación que el cliente dio a esta factura (1-5). NULL = aún no calificada. Se propaga a `reviews` para cada item del catálogo.';
comment on column public.invoices.rated_at is
  'Cuándo el cliente envió la calificación. Se usa para evitar re-calificaciones.';

create index if not exists invoices_rating_idx
  on public.invoices(rating) where rating is not null;
