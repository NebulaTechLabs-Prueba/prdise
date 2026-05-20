-- ============================================================================
-- 0007 — Tablas `coupons` y `coupon_redemptions`
-- ============================================================================
--
-- Catálogo de códigos promocionales + historial de canjes. Soft delete en
-- `coupons` vía deleted_at. RLS:
--   * coupons: SELECT abierto a autenticados (necesario para validar códigos
--     en checkout); INSERT/UPDATE/DELETE solo admin.
--   * coupon_redemptions: SELECT a dueño + staff; INSERT desde server con
--     identidad del usuario.
-- ============================================================================

-- ─── COUPONS ────────────────────────────────────────────────────────────────
create table public.coupons (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  description_es  text,
  description_en  text,
  discount_pct    integer not null check (discount_pct between 0 and 100),
  max_uses        integer check (max_uses is null or max_uses >= 0),
  used_count      integer not null default 0 check (used_count >= 0),
  expires_at      date,
  active          boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

comment on table public.coupons is
  'Códigos promocionales con descuento porcentual. Soft delete vía deleted_at.';

create index coupons_active_idx     on public.coupons(active) where deleted_at is null;
create index coupons_expires_at_idx on public.coupons(expires_at);

create trigger coupons_set_updated_at
  before update on public.coupons
  for each row execute function public.tg_set_updated_at();

-- ─── COUPON REDEMPTIONS ─────────────────────────────────────────────────────
create table public.coupon_redemptions (
  id              uuid primary key default gen_random_uuid(),
  coupon_id       uuid not null references public.coupons(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  booking_id      uuid references public.bookings(id) on delete set null,
  amount_cents    integer not null check (amount_cents >= 0),
  discount_cents  integer not null check (discount_cents >= 0),
  redeemed_at     timestamptz not null default now()
);

comment on table public.coupon_redemptions is
  'Historial de canjes de cupones. Inmutable: no se editan ni eliminan.';

create index coupon_redemptions_coupon_idx  on public.coupon_redemptions(coupon_id);
create index coupon_redemptions_user_idx    on public.coupon_redemptions(user_id);
create index coupon_redemptions_booking_idx on public.coupon_redemptions(booking_id);

-- ─── RLS: coupons ───────────────────────────────────────────────────────────
alter table public.coupons enable row level security;

-- Lectura: autenticados pueden ver activos no expirados ni borrados.
-- Staff/admin ven todos.
create policy coupons_authenticated_read_active on public.coupons
  for select using (
    public.fn_is_staff()
    or (
      auth.uid() is not null
      and active = true
      and deleted_at is null
      and (expires_at is null or expires_at >= current_date)
    )
  );

-- Escritura: solo admin.
create policy coupons_admin_write on public.coupons
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ─── RLS: coupon_redemptions ────────────────────────────────────────────────
alter table public.coupon_redemptions enable row level security;

-- Lectura: dueño + staff.
create policy coupon_redemptions_select_own_or_staff on public.coupon_redemptions
  for select using (user_id = auth.uid() or public.fn_is_staff());

-- Insert: el usuario puede crear un canje a su nombre; staff también.
create policy coupon_redemptions_insert_own_or_staff on public.coupon_redemptions
  for insert with check (user_id = auth.uid() or public.fn_is_staff());
