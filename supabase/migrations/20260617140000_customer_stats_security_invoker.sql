-- ============================================================================
-- HOTFIX seguridad: customer_stats debe ser SECURITY INVOKER, no DEFINER
-- ============================================================================
--
-- Supabase Security Advisor 2026-06-17 (CRITICAL):
--   La vista public.customer_stats fue detectada con SECURITY DEFINER.
--   Una vista con DEFINER bypasea RLS — corre con permisos de su creador
--   (postgres), no del caller. Combinado con el GRANT a anon/authenticated,
--   cualquier usuario podía leer stats de TODOS los clientes.
--
-- La migración original (20260611180000_profiles_birth_date) decía
-- "SECURITY INVOKER (default)" en comments pero no lo seteó explícito.
-- PG 15+ requiere WITH (security_invoker = true) para garantizar el comportamiento.
--
-- ALTER VIEW ... SET (security_invoker = true) fuerza el modo correcto sin
-- recrear la vista (preserva grants + dependencias en database.types).
-- ============================================================================

alter view public.customer_stats set (security_invoker = true);

comment on view public.customer_stats is
  'Stats agregadas por cliente: total invertido (invoices paid), servicios solicitados (invoice_items), y categoría más frecuente. SECURITY INVOKER explícito (PM 2026-06-17 hotfix) — respeta el RLS del caller; anon/authenticated solo ven lo que sus policies de profiles+invoices les permiten.';
