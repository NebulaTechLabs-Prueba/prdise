-- ============================================================================
-- invoices.payment_method — método de pago elegido al crear la factura
-- ============================================================================
--
-- PM 2026-06-26: el admin elige Stripe / PayPal / Off-system al crear cada
-- factura. Antes solo se logueaba en el audit_log; nunca llegaba al row
-- de invoices, así que el UI mostraba TODOS los botones de generar link
-- (Stripe y PayPal) en cada fila, sin importar la elección.
--
-- Esta migración persiste el método como TEXT (no enum porque "off_system"
-- no está en el enum payment_method de la tabla payments).
-- ============================================================================

alter table public.invoices
  add column if not exists payment_method text;

comment on column public.invoices.payment_method is
  'Método de pago elegido al crear la factura: stripe | paypal | off_system. UI muestra solo el botón de generar link del método correspondiente.';

-- Backfill: facturas existentes sin método quedan como off_system (admin las
-- maneja manualmente). Si tenían un link de Stripe o PayPal ya generado,
-- inferimos el método.
update public.invoices
   set payment_method = case
     when stripe_payment_link_url is not null and stripe_payment_link_url <> '' then 'stripe'
     when paypal_payment_link_url is not null and paypal_payment_link_url <> '' then 'paypal'
     else 'off_system'
   end
 where payment_method is null;
