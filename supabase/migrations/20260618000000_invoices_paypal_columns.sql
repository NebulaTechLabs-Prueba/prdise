-- ============================================================================
-- PayPal: columnas en invoices + índice de lookup por order_id
-- ============================================================================
--
-- PM 2026-06-18: paridad con Stripe. El admin genera un PayPal Order ("approve
-- URL") para una invoice; al pagar el cliente, PayPal dispara
-- PAYMENT.CAPTURE.COMPLETED al webhook, que marca el invoice como paid.
--
-- - paypal_order_id          : id devuelto por POST /v2/checkout/orders
-- - paypal_payment_link_url  : URL `approve` (https://www.paypal.com/checkoutnow?...)
--                              que se manda al cliente por WhatsApp.
--
-- Index parcial: lookup del webhook por order_id cuando el `custom_id` no
-- viaja en el resource del evento (modo defensivo, idéntico al de Stripe).
-- ============================================================================

alter table public.invoices
  add column if not exists paypal_order_id text,
  add column if not exists paypal_payment_link_url text;

create index if not exists invoices_paypal_order_idx
  on public.invoices(paypal_order_id)
  where paypal_order_id is not null;

comment on column public.invoices.paypal_order_id is
  'ID del PayPal Order (v2/checkout/orders). Lookup del webhook.';
comment on column public.invoices.paypal_payment_link_url is
  'URL approve de PayPal que se envía al cliente por WhatsApp/email.';
