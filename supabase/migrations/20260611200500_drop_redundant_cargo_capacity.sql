-- ============================================================================
-- 0024.1 — Cleanup: drop redundant vehicles.cargo_capacity
-- ============================================================================
--
-- La migración 0024 agregó `cargo_capacity` a vehicles, pero el campo
-- `max_luggage` (sembrado en 0002) ya cumple la misma función. Lo dejamos en
-- max_luggage para no duplicar conceptos.
-- ============================================================================

alter table public.vehicles
  drop column if exists cargo_capacity;
