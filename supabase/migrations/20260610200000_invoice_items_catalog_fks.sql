-- ============================================================================
-- 0018 — invoice_items: FKs opcionales al catálogo
-- ============================================================================
--
-- Para que el admin pueda emitir invoices que linkeen explícitamente a
-- servicios del catálogo (tour/stay/transfer_route), agregamos columnas
-- nullable. Permite:
--   * Reporting: "¿cuánto vendimos del tour X este mes?"
--   * Auto-fill de descripción/precio en el modal nuevo de invoice.
--   * Dedupe contra invoices recientes con el mismo servicio.
--
-- Las columnas son nullable: una invoice "custom" (un servicio personalizado
-- que no está en el catálogo) sigue siendo válida sin FK.
-- ============================================================================

alter table public.invoice_items
  add column if not exists tour_id            uuid references public.tours(id) on delete set null,
  add column if not exists stay_id            uuid references public.stays(id) on delete set null,
  add column if not exists transfer_route_id  uuid references public.transfer_routes(id) on delete set null;

create index if not exists invoice_items_tour_idx     on public.invoice_items(tour_id)            where tour_id is not null;
create index if not exists invoice_items_stay_idx     on public.invoice_items(stay_id)            where stay_id is not null;
create index if not exists invoice_items_transfer_idx on public.invoice_items(transfer_route_id)  where transfer_route_id is not null;

comment on column public.invoice_items.tour_id is
  'FK opcional al tour del catálogo. NULL = línea custom (no en catálogo).';
comment on column public.invoice_items.stay_id is
  'FK opcional al stay del catálogo. NULL = línea custom.';
comment on column public.invoice_items.transfer_route_id is
  'FK opcional a la ruta de transfer. NULL = línea custom.';
