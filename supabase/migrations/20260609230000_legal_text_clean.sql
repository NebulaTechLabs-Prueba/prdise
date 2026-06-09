-- ============================================================================
-- 0017 — Limpiar placeholder legal: quitar instrucción admin del público
-- ============================================================================
--
-- El seed previo (20260609200000) puso un texto placeholder que incluía
-- "Edita este texto desde el panel admin: Settings → Legal." — esa línea
-- es instrucción para el admin, NO debe verse en /terms o /privacy
-- públicos. PM 2026-06-09: corregirlo.
--
-- Solo actualizamos las filas que TODAVÍA tienen el placeholder exacto;
-- si el admin ya editó el contenido, no tocamos nada (idempotente).
-- ============================================================================

update public.site_settings
set value = E'Términos y Condiciones\n\nEl contenido legal será publicado próximamente.'
where key = 'terms_es'
  and value like '%Edita este texto%';

update public.site_settings
set value = E'Terms & Conditions\n\nLegal content will be published soon.'
where key = 'terms_en'
  and value like '%Edit this text%';

update public.site_settings
set value = E'Política de Privacidad\n\nEl contenido legal será publicado próximamente.'
where key = 'privacy_es'
  and value like '%Edita este texto%';

update public.site_settings
set value = E'Privacy Policy\n\nLegal content will be published soon.'
where key = 'privacy_en'
  and value like '%Edit this text%';
