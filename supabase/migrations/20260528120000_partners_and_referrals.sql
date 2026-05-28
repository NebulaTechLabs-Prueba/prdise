-- ============================================================================
-- 0009 — Pivote a modelo de referrals: tabla partners + partner_referrals
-- ============================================================================
--
-- Cambio de modelo de negocio: stays y tours dejan de ser transaccionales en
-- prdise; pasan a ser referrals a páginas aliadas. Solo transfers siguen
-- siendo transaccionales nativos.
--
-- Cambios incluidos:
--   * Tabla `partners` (CRUD admin).
--   * Tabla `partner_referrals` (log de clicks salientes para reporting).
--   * Columnas `partner_id` + `partner_url` en stays y tours.
--   * Permisos granulares `partners:read|write|delete` y `referrals:read`.
--   * Modificación del trigger de loyalty: solo otorga puntos en transfers.
-- ============================================================================

-- ─── PARTNERS ───────────────────────────────────────────────────────────────
create table public.partners (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  base_url        text not null,
  logo            text,
  contact_email   text,
  contact_phone   text,
  notes_es        text,
  notes_en        text,
  utm_source      text not null default 'prdise',
  affiliate_code  text,
  active          boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

comment on table public.partners is
  'Páginas aliadas a las que prdise refiere usuarios para stays/tours.';

create index partners_active_idx on public.partners(active) where deleted_at is null;
create index partners_slug_idx   on public.partners(slug);

create trigger partners_set_updated_at
  before update on public.partners
  for each row execute function public.tg_set_updated_at();

-- ─── PARTNER REFERRALS (log de clicks salientes) ────────────────────────────
create table public.partner_referrals (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references public.partners(id) on delete cascade,
  item_type     public.item_type not null,
  item_id       uuid not null,
  user_id       uuid references public.profiles(id) on delete set null,
  user_agent    text,
  ip            inet,
  referrer      text,
  redirected_at timestamptz not null default now()
);

comment on table public.partner_referrals is
  'Log de clicks salientes a partners. Inmutable: solo INSERT y SELECT.';

create index partner_referrals_partner_idx on public.partner_referrals(partner_id, redirected_at desc);
create index partner_referrals_item_idx    on public.partner_referrals(item_type, item_id);
create index partner_referrals_user_idx    on public.partner_referrals(user_id) where user_id is not null;

-- ─── ALTERAR STAYS / TOURS ──────────────────────────────────────────────────
alter table public.stays
  add column partner_id  uuid references public.partners(id) on delete set null,
  add column partner_url text;

alter table public.tours
  add column partner_id  uuid references public.partners(id) on delete set null,
  add column partner_url text;

create index stays_partner_idx on public.stays(partner_id) where partner_id is not null;
create index tours_partner_idx on public.tours(partner_id) where partner_id is not null;

-- ─── PERMISOS GRANULARES NUEVOS ─────────────────────────────────────────────
-- Ampliar el check constraint de area para incluir 'partners'.
alter table public.permissions drop constraint permissions_area_check;
alter table public.permissions add constraint permissions_area_check check (
  area in ('stays','tours','transfers','payments','bookings','users','posts','reviews','settings','partners')
);

insert into public.permissions (key, label_es, label_en, description_es, description_en, area) values
  ('partners:read',   'Ver alianzas',           'View partners',
   'Permite ver el listado y detalles de páginas aliadas.',
   'Allows viewing the list and details of partner pages.',
   'partners'),
  ('partners:write',  'Crear/editar alianzas',  'Create/edit partners',
   'Permite crear y modificar páginas aliadas.',
   'Allows creating and modifying partner pages.',
   'partners'),
  ('partners:delete', 'Eliminar alianzas',      'Delete partners',
   'Permite dar de baja (soft delete) una página aliada.',
   'Allows deactivating (soft delete) a partner page.',
   'partners'),
  ('referrals:read',  'Ver reportes de referidos','View referral reports',
   'Permite consultar el log de clicks salientes a partners.',
   'Allows viewing the log of outbound clicks to partners.',
   'partners');

-- ─── RLS: partners ──────────────────────────────────────────────────────────
alter table public.partners enable row level security;

-- Lectura pública de partners activos (necesario para resolver deeplinks en
-- catálogo público). Staff ve todos incluyendo borrados.
create policy partners_public_read_active on public.partners
  for select using (
    public.fn_is_staff()
    or (active = true and deleted_at is null)
  );

-- Escritura: requiere permiso granular partners:write (admin auto-OK).
create policy partners_write_with_permission on public.partners
  for all using (public.fn_has_permission('partners:write'))
  with check (public.fn_has_permission('partners:write'));

-- ─── RLS: partner_referrals ─────────────────────────────────────────────────
alter table public.partner_referrals enable row level security;

-- Lectura: solo staff con permiso referrals:read (para reporting).
create policy partner_referrals_staff_read on public.partner_referrals
  for select using (public.fn_has_permission('referrals:read'));

-- Insert: cualquier autenticado o anónimo puede registrar un click (el server
-- valida que partner_id existe). Esto es el equivalente a un "evento" público.
-- NO permitir UPDATE ni DELETE (log inmutable).
create policy partner_referrals_anyone_insert on public.partner_referrals
  for insert with check (true);

-- ─── TRIGGER LOYALTY: solo transfers otorgan puntos ────────────────────────
-- Antes: cualquier booking completado sumaba puntos.
-- Ahora: solo bookings de item_type = 'transfer' (stays/tours no son
-- transaccionales en prdise; son referrals a partners).
create or replace function public.tg_award_points_on_booking_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pts integer;
begin
  if new.status = 'completed'
     and (old.status is null or old.status <> 'completed')
     and new.item_type = 'transfer'
  then
    -- 100 pts por cada USD (total_cents está en centavos → ÷100 = USD, ×100 = pts).
    pts := new.total_cents;
    update public.profiles p
       set points_balance = p.points_balance + pts,
           tier = public.fn_tier_from_points(p.points_balance + pts)
     where p.id = new.user_id;
  end if;
  return new;
end;
$$;

comment on function public.tg_award_points_on_booking_completed() is
  'Otorga loyalty points SOLO al completar bookings de transfer. Stays/tours son referrals.';
