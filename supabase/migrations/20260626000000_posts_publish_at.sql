-- ============================================================================
-- posts.publish_at — fecha de publicación PROGRAMADA (distinta de published_at)
-- ============================================================================
--
-- PM 2026-06-26: el form de Posts soportaba 'scheduled' en UI pero la fecha
-- nunca se persistía — el post quedaba invisible para siempre. Cambios:
--
--   * Columna nueva `publish_at` (TIMESTAMPTZ, nullable). Representa "cuándo
--     debería volverse público". Distinta de `published_at` (timestamp en que
--     un admin pasó manualmente a status='published').
--
--   * Public reader (getPublishedPosts) usa filtro híbrido:
--       status='published'
--       OR (status='scheduled' AND publish_at IS NOT NULL AND publish_at <= now())
--     → no necesita cron, el post aparece exactamente a la hora programada
--     en la siguiente request que toque la query.
--
--   * Admin sigue viendo el status real ('scheduled') con un badge "LIVE"
--     cuando la fecha ya pasó (lo agrega el front).
-- ============================================================================

alter table public.posts
  add column if not exists publish_at timestamptz;

comment on column public.posts.publish_at is
  'Fecha futura programada de publicación. Si status=scheduled y publish_at<=now(), el post se sirve público sin necesidad de cambiar status manualmente.';

-- Índice para que el filtro híbrido del reader público sea barato.
create index if not exists posts_scheduled_publish_at_idx
  on public.posts(publish_at)
  where status = 'scheduled' and publish_at is not null;
