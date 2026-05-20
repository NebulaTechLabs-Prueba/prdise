-- ============================================================================
-- 0002 — Profiles extendiendo auth.users + helpers de RLS
-- ============================================================================

-- Tabla profiles: una fila por usuario en auth.users.
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          public.user_role   not null default 'user',
  status        public.user_status not null default 'active',

  first_name    text,
  last_name     text,
  phone         text,
  country       text,
  lang_pref     public.language_code not null default 'es',

  -- Solo aplica si role in ('employee', 'manager').
  employee_id   text,
  position      text,
  department    text,

  -- Loyalty.
  points_balance integer not null default 0 check (points_balance >= 0),
  points_spent   integer not null default 0 check (points_spent >= 0),
  tier           public.loyalty_tier not null default 'bronze',

  -- Seguridad.
  tfa_enabled    boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table public.profiles is
  'Datos del usuario más allá de auth.users. Soft delete vía status=inactive + deleted_at.';

create index profiles_role_idx        on public.profiles(role);
create index profiles_status_idx      on public.profiles(status);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- Trigger guard: bloquea cambios en columnas privilegiadas desde clientes
-- no-admin. Las policies RLS permiten UPDATE pero no limitan columnas,
-- así que la protección de campos sensibles se hace aquí.
-- ----------------------------------------------------------------------------
create or replace function public.tg_profiles_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role (NULL en auth.uid()) puede modificar cualquier cosa.
  if auth.uid() is null then
    return new;
  end if;

  -- Admin puede modificar cualquier cosa.
  if public.fn_is_admin() then
    return new;
  end if;

  -- El resto solo puede modificar campos no sensibles.
  new.role           := old.role;
  new.status         := old.status;
  new.points_balance := old.points_balance;
  new.points_spent   := old.points_spent;
  new.tier           := old.tier;
  new.deleted_at     := old.deleted_at;
  new.employee_id    := old.employee_id;
  new.position       := old.position;
  new.department     := old.department;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.tg_profiles_guard_update();

-- ----------------------------------------------------------------------------
-- Trigger: al crear un usuario en auth.users, crear su profile automáticamente.
-- ----------------------------------------------------------------------------
create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', null),
    coalesce(new.raw_user_meta_data->>'last_name',  null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- ----------------------------------------------------------------------------
-- Helpers de RLS (SECURITY DEFINER para evitar recursión sobre profiles).
-- ----------------------------------------------------------------------------
create or replace function public.fn_current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.fn_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false);
$$;

create or replace function public.fn_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('admin', 'manager', 'employee'),
    false
  );
$$;

-- ----------------------------------------------------------------------------
-- RLS de profiles.
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Lectura: el dueño ve su perfil; staff ve todos.
create policy profiles_select_own_or_staff on public.profiles
  for select
  using (
    auth.uid() = id
    or public.fn_is_staff()
  );

-- Update: dueño puede modificar su perfil EXCEPTO role, status, points, tier.
-- (esos se controlan vía funciones server-side con service_role).
create policy profiles_update_own on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admin puede modificar cualquier perfil.
create policy profiles_update_admin on public.profiles
  for update
  using (public.fn_is_admin())
  with check (public.fn_is_admin());

-- Insert se hace solo vía el trigger on_auth_user_created (security definer).
-- No exponemos insert directo desde clientes.
