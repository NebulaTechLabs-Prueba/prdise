-- ============================================================================
-- 0011 — Invoices: campos Stripe Payment Link + PDF + WhatsApp
-- ============================================================================
--
-- Pivote 2026-06-04: PRDISE pasa a modelo catálogo+referral. Las facturas se
-- crean manualmente por el admin (no más generación automática desde cart) y
-- llevan un Stripe Payment Link como método de cobro único. El PDF se genera
-- server-side y se almacena en Storage; se envía manualmente por WhatsApp.
--
-- Cambios:
--   * Agregar columnas stripe_payment_link_url, stripe_payment_link_id, pdf_url
--     y customer_whatsapp en `invoices`.
--   * Aflojar la default de status: nuevas invoices arrancan en 'draft' hasta
--     que se les genere el Payment Link (pasa a 'pending') y se cobre ('paid').
--   * Agregar 'pending' al set de status válidos.
--   * Bucket de Storage `invoice-pdfs` privado para los PDFs generados.
-- ============================================================================

alter table public.invoices
  add column if not exists stripe_payment_link_url text,
  add column if not exists stripe_payment_link_id  text,
  add column if not exists pdf_url                 text,
  add column if not exists customer_whatsapp       text;

-- Reemplazar el check de status para incluir 'pending' (entre draft y paid:
-- factura creada con Payment Link, esperando que el cliente pague).
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check check (
  status in ('draft','pending','sent','paid','overdue','cancelled','refunded')
);

-- Cambiar default a 'draft' (admin crea, luego adjunta Stripe link).
alter table public.invoices alter column status set default 'draft';

-- ─── Storage bucket privado para PDFs ───────────────────────────────────────
-- Creamos el bucket idempotente. Acceso solo via URL firmada generada por el
-- servidor; nunca exponemos el bucket público.
insert into storage.buckets (id, name, public)
values ('invoice-pdfs', 'invoice-pdfs', false)
on conflict (id) do nothing;

-- Solo staff puede subir/listar/borrar PDFs. Lectura via signed URL no requiere
-- policy (la signed URL bypasea RLS dentro del TTL).
create policy "invoice_pdfs_staff_write"
  on storage.objects for insert
  with check (bucket_id = 'invoice-pdfs' and public.fn_is_staff());

create policy "invoice_pdfs_staff_read"
  on storage.objects for select
  using (bucket_id = 'invoice-pdfs' and public.fn_is_staff());

create policy "invoice_pdfs_staff_update"
  on storage.objects for update
  using (bucket_id = 'invoice-pdfs' and public.fn_is_staff())
  with check (bucket_id = 'invoice-pdfs' and public.fn_is_staff());

create policy "invoice_pdfs_staff_delete"
  on storage.objects for delete
  using (bucket_id = 'invoice-pdfs' and public.fn_is_staff());
