-- ============================================================================
-- Pricing markup (sobreprecio admin) — stays + tours
-- ============================================================================
--
-- PM 2026-06-15 (instrucción del cliente):
--   Algunos partners (Aventureo PR, y a futuro otros) entregan al cliente sus
--   precios "netos" y esperan que PRDISE cobre su comisión añadiendo un %
--   sobre ese precio. Para evitar cobrar manualmente al partner y dar
--   seguimiento por separado, queremos exponer el precio "final" al público
--   ya con el markup incluido — pero conservando el precio base original
--   en DB para auditoría y poder ajustar/eliminar el markup en el futuro.
--
--   Requisito: el markup NO debe aparecer como línea separada en el invoice
--   ni desglosarse al cliente. Se computa transparentemente como parte del
--   precio final del servicio. Distingue de pricing_extras (que sí son
--   líneas opcionales visibles).
--
-- Modelado:
--   - `markup_type`: NULL = sin sobreprecio (price = price_cents).
--                    'percent' = porcentaje sobre price_cents.
--                    'amount'  = cantidad fija en CENTAVOS (puede ser negativa
--                                para descuento; admin uso interno).
--   - `markup_value`: numeric. Para percent es el % (ej. 20 = +20%, -10 = -10%).
--                     Para amount son centavos (ej. 1500 = +$15).
--
-- Fórmula de precio efectivo (resuelta en el mapper del front, no en DB):
--     percent → round(price_cents * (1 + markup_value/100))
--     amount  → price_cents + markup_value
-- ============================================================================

alter table public.stays
  add column if not exists markup_type text,
  add column if not exists markup_value numeric;

alter table public.tours
  add column if not exists markup_type text,
  add column if not exists markup_value numeric;

-- Constraint: tipo válido o NULL coherente con value (ambos NULL o ambos set).
alter table public.stays
  add constraint stays_markup_type_check
  check (markup_type is null or markup_type in ('percent', 'amount'));

alter table public.tours
  add constraint tours_markup_type_check
  check (markup_type is null or markup_type in ('percent', 'amount'));

-- Si type='percent', value debe estar en rango razonable. -100 = -100% (gratis),
-- 1000 = +1000%. Tolerante para casos futuros (servicio "premium" muy marcado
-- arriba). Para amount no ponemos límite duro — el app valida que el final
-- price_cents no sea < 0.
alter table public.stays
  add constraint stays_markup_value_percent_range
  check (
    markup_type is distinct from 'percent'
    or (markup_value is not null and markup_value >= -100 and markup_value <= 1000)
  );

alter table public.tours
  add constraint tours_markup_value_percent_range
  check (
    markup_type is distinct from 'percent'
    or (markup_value is not null and markup_value >= -100 and markup_value <= 1000)
  );

comment on column public.stays.markup_type is
  'Sobreprecio admin: null|percent|amount. Aplicado a price_cents para derivar el precio público. No se desglosa en invoice.';
comment on column public.stays.markup_value is
  'Valor del markup. Si type=percent es el %. Si type=amount son centavos (puede ser negativo).';
comment on column public.tours.markup_type is
  'Sobreprecio admin: null|percent|amount. Mismo modelo que stays.markup_type.';
comment on column public.tours.markup_value is
  'Valor del markup. Si type=percent es el %. Si type=amount son centavos (puede ser negativo).';
