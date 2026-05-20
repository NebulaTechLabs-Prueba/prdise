-- ============================================================================
-- 0001 — Tipos enum y funciones helper compartidas
-- ============================================================================

-- Roles de usuario.
create type public.user_role as enum ('admin', 'manager', 'employee', 'user');

-- Estado del perfil (soft delete vía 'inactive').
create type public.user_status as enum ('active', 'inactive');

-- Códigos de idioma soportados por la plataforma.
create type public.language_code as enum ('es', 'en');

-- Tipos de producto bookable.
create type public.item_type as enum ('stay', 'tour', 'transfer');

-- Estados del booking.
create type public.booking_status as enum (
  'pending',           -- creado, pago no iniciado
  'pending_payment',   -- pago iniciado, sin confirmar
  'confirmed',         -- pago confirmado (online auto o admin offline)
  'cancelled',
  'completed',
  'refunded'
);

-- Métodos de pago disponibles.
create type public.payment_method as enum ('stripe', 'paypal', 'ath', 'bank');

-- Estados del pago.
create type public.payment_status as enum (
  'pending',     -- creado, sin movimiento
  'claimed',     -- usuario reportó pago offline
  'confirmed',   -- procesador (online) o admin (offline) confirmó
  'rejected',    -- admin rechazó claim offline
  'refunded'
);

-- Estados de contenido (posts, reviews) que requieren moderación.
create type public.content_status as enum ('draft', 'scheduled', 'published', 'archived');

-- Tiers de loyalty.
create type public.loyalty_tier as enum ('bronze', 'silver', 'gold');

-- ----------------------------------------------------------------------------
-- Función reusable para mantener updated_at al día.
-- ----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Función para calcular tier a partir de puntos acumulados.
--   bronze: 0..499
--   silver: 500..1999
--   gold:   2000+
-- ----------------------------------------------------------------------------
create or replace function public.fn_tier_from_points(points integer)
returns public.loyalty_tier
language plpgsql
immutable
as $$
begin
  if points >= 2000 then return 'gold';
  elsif points >= 500 then return 'silver';
  else return 'bronze';
  end if;
end;
$$;
