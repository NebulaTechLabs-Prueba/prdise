-- ============================================================================
-- 0015 — Contenido legal (terms & privacy) editable desde admin
-- ============================================================================
--
-- PM 2026-06-09: las páginas de Términos y Condiciones / Política de
-- Privacidad estaban vacías en el sitio público. Mejor práctica para v1:
-- guardar el contenido como text en site_settings (4 keys, ES/EN para cada
-- documento). El admin edita via textarea desde Settings → Legal, no hay
-- file uploads. Las páginas /terms y /privacy renderizan el text con
-- whitespace preservado (white-space: pre-wrap).
--
-- Si en el futuro se quiere markdown/HTML, basta con cambiar el renderer
-- de la página pública. La columna `value` de site_settings es text sin
-- límite así que cabe contenido extenso.
-- ============================================================================

insert into public.site_settings (key, value, description) values
  ('terms_es',
   E'Términos y Condiciones\n\nEl contenido legal será publicado próximamente.\n\nEdita este texto desde el panel admin: Settings → Legal.',
   'Términos y Condiciones en español. Editable desde admin Settings → Legal.'),
  ('terms_en',
   E'Terms & Conditions\n\nLegal content will be published soon.\n\nEdit this text from the admin panel: Settings → Legal.',
   'Terms & Conditions in English. Editable from admin Settings → Legal.'),
  ('privacy_es',
   E'Política de Privacidad\n\nEl contenido legal será publicado próximamente.\n\nEdita este texto desde el panel admin: Settings → Legal.',
   'Política de Privacidad en español. Editable desde admin Settings → Legal.'),
  ('privacy_en',
   E'Privacy Policy\n\nLegal content will be published soon.\n\nEdit this text from the admin panel: Settings → Legal.',
   'Privacy Policy in English. Editable from admin Settings → Legal.')
on conflict (key) do nothing;
