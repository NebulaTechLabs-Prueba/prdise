-- ============================================================================
-- Vehicles: features + description editables
-- ============================================================================
--
-- PM 2026-06-17: en el resultado de búsqueda de transfer las cards muestran
-- chips de "features" (A/C, Pro driver, Water, WiFi) y una descripción
-- corta. Estaban hardcoded en el mapper del frontend — todos los vehículos
-- mostraban EXACTAMENTE lo mismo aunque el admin creara distintos. Hacerlos
-- editables desde el form del admin.
--
-- features: array de strings (jsonb para flexibilidad y consistencia con
-- amenities/includes del resto del catálogo).
-- description: texto corto opcional (ej. "Furgoneta amplia con A/C de
-- 3 zonas, ideal para grupos familiares").
-- ============================================================================

alter table public.vehicles
  add column if not exists features jsonb not null default '[]'::jsonb,
  add column if not exists description text;

comment on column public.vehicles.features is
  'Array de strings con chips de características (ej. ["A/C","WiFi"]).';
comment on column public.vehicles.description is
  'Descripción corta opcional mostrada bajo el nombre del vehículo.';
