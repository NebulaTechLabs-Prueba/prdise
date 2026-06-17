-- ============================================================================
-- Vehicles: tarifa por km editable por vehículo
-- ============================================================================
--
-- PM 2026-06-17 (continuación de la queja sobre campos hardcoded): el
-- frontend calculaba el total de un viaje como `vehicle.base + 2.5 × km`
-- — el 2.5 era literal en el mapper. Un SUV/van no cuesta lo mismo por km
-- que un sedan, así que el admin necesita poder fijar la tarifa por km de
-- CADA vehículo.
--
-- Modelado:
--   price_per_km_cents integer (CENTAVOS por km). Nullable para back-compat
--   con vehículos que aún no la tengan seteada; el frontend hace fallback
--   a 0 si null (es decir, solo precio fijo `base` sin componente variable).
-- ============================================================================

alter table public.vehicles
  add column if not exists price_per_km_cents integer;

alter table public.vehicles
  add constraint vehicles_price_per_km_cents_check
  check (price_per_km_cents is null or price_per_km_cents >= 0);

comment on column public.vehicles.price_per_km_cents is
  'Tarifa por km en centavos. Multiplica por route.distance_km para calcular el componente variable del viaje. NULL → no se cobra por km, solo el `price_cents` base.';
