-- ============================================================================
-- Bucket público de imágenes de servicios (catálogo)
-- ============================================================================
--
-- PM 2026-06-15: el admin necesita subir fotos reales para stays/tours (no
-- solo pegar URL externa). Las imágenes son públicas — se sirven directo en
-- las cards del catálogo y detail pages para cualquier visitante anónimo.
--
-- Diferencias con invoice-pdfs (privado, signed URL):
--   - public = true → cualquiera puede leer via URL pública estable.
--   - Storage RLS solo aplica a INSERT/UPDATE/DELETE; SELECT está abierto.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('service-images', 'service-images', true)
on conflict (id) do nothing;

-- Solo staff puede subir/modificar/borrar imágenes del catálogo. La lectura
-- es pública por configuración del bucket — no necesita policy.
create policy "service_images_staff_write"
  on storage.objects for insert
  with check (bucket_id = 'service-images' and public.fn_is_staff());

create policy "service_images_staff_update"
  on storage.objects for update
  using (bucket_id = 'service-images' and public.fn_is_staff())
  with check (bucket_id = 'service-images' and public.fn_is_staff());

create policy "service_images_staff_delete"
  on storage.objects for delete
  using (bucket_id = 'service-images' and public.fn_is_staff());
