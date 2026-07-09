-- ============================================================================
-- invoices: campos de devolución (refund manual fuera del sistema)
-- ============================================================================
--
-- PM 2026-07-09: el cliente hace las devoluciones fuera del sistema
-- (Stripe Dashboard, transferencia manual, efectivo). El sistema solo
-- necesita registrar QUE se hizo la devolución, POR CUÁNTO, y opcional
-- una referencia externa.
--
-- Solo aplicable a facturas en status='paid' → pasan a 'refunded'.
-- El enum ya contiene 'refunded' desde 20260604180000_invoices_stripe_pdf.sql.
-- ============================================================================

alter table public.invoices
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_amount_cents integer,
  add column if not exists refund_ref text,
  add column if not exists refund_notes text;

comment on column public.invoices.refunded_at is
  'Timestamp de cuando el admin marcó la factura como devuelta.';
comment on column public.invoices.refunded_amount_cents is
  'Monto devuelto en cents. Puede ser < total_cents (parcial) o = total_cents (total).';
comment on column public.invoices.refund_ref is
  'Referencia opcional del refund externo (ej. Stripe refund id, número de transferencia).';
comment on column public.invoices.refund_notes is
  'Notas libres del admin sobre la devolución (motivo, canal, etc).';
