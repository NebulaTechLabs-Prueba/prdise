-- ============================================================================
-- 0016 — Roles custom (overlay sobre admin/user)
-- ============================================================================
--
-- PM 2026-06-09: el sistema tiene 2 roles base (admin, user) en el enum
-- user_role. El admin puede CREAR ROLES CUSTOM como extensión: el rol
-- custom es una bolsa de permisos granulares (de la tabla `permissions`)
-- que se asigna opcionalmente a un user para concederle capacidades de
-- admin sin promoverlo a admin completo.
--
-- Modelo:
--   * custom_roles: catálogo de roles custom (id, name único, labels ES/EN,
--     descripción, soft delete).
--   * custom_role_permissions: N:N (role_id × permission_key).
--   * profiles.custom_role_id: nullable FK; si un user lo tiene, hereda los
--     permisos de ese rol.
--
-- Permisos efectivos del caller:
--   1) fn_is_admin() → todo (cortocircuito).
--   2) exists user_permissions (asignación directa legacy) → ese permiso.
--   3) exists custom_role_permissions vía profiles.custom_role_id → ese permiso.
--
-- RLS:
--   * custom_roles: SELECT autenticados (para mostrar label en /account),
--     INSERT/UPDATE/DELETE solo admin (fn_is_admin).
--   * custom_role_permissions: idem.
-- ============================================================================

-- ─── custom_roles ──────────────────────────────────────────────────────────
create table public.custom_roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  label_es     text not null,
  label_en     text not null,
  description  text,
  active       boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

comment on table public.custom_roles is
  'Roles custom creados por admin. Overlay sobre el enum user_role; agregan permisos granulares.';

-- name único entre filas no borradas; idempotente para soft-deletes.
create unique index custom_roles_name_unique
  on public.custom_roles(name)
  where deleted_at is null;

create index custom_roles_active_idx
  on public.custom_roles(active) where deleted_at is null;

create trigger custom_roles_set_updated_at
  before update on public.custom_roles
  for each row execute function public.tg_set_updated_at();

-- ─── custom_role_permissions ───────────────────────────────────────────────
create table public.custom_role_permissions (
  role_id        uuid not null references public.custom_roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  granted_at     timestamptz not null default now(),
  primary key (role_id, permission_key)
);

comment on table public.custom_role_permissions is
  'Permisos granulares concedidos a un rol custom. N:N entre custom_roles y permissions.';

create index custom_role_permissions_role_idx
  on public.custom_role_permissions(role_id);
create index custom_role_permissions_perm_idx
  on public.custom_role_permissions(permission_key);

-- ─── profiles.custom_role_id ───────────────────────────────────────────────
alter table public.profiles
  add column if not exists custom_role_id uuid references public.custom_roles(id) on delete set null;

create index if not exists profiles_custom_role_idx
  on public.profiles(custom_role_id) where custom_role_id is not null;

-- ─── fn_has_permission: incluir rol custom ─────────────────────────────────
create or replace function public.fn_has_permission(perm_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.fn_is_admin()
    or exists (
      select 1 from public.user_permissions up
      where up.user_id = auth.uid() and up.permission_key = perm_key
    )
    or exists (
      select 1
      from public.profiles p
      join public.custom_role_permissions crp on crp.role_id = p.custom_role_id
      where p.id = auth.uid() and crp.permission_key = perm_key
    );
$$;

comment on function public.fn_has_permission(text) is
  'True si caller es admin, o tiene el permiso vía user_permissions directo, o vía profiles.custom_role_id → custom_role_permissions.';

-- ─── RLS: custom_roles ─────────────────────────────────────────────────────
alter table public.custom_roles enable row level security;

create policy custom_roles_select_auth on public.custom_roles
  for select using (auth.uid() is not null);

create policy custom_roles_insert_admin on public.custom_roles
  for insert with check (public.fn_is_admin());

create policy custom_roles_update_admin on public.custom_roles
  for update using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy custom_roles_delete_admin on public.custom_roles
  for delete using (public.fn_is_admin());

-- ─── RLS: custom_role_permissions ─────────────────────────────────────────
alter table public.custom_role_permissions enable row level security;

create policy crp_select_auth on public.custom_role_permissions
  for select using (auth.uid() is not null);

create policy crp_insert_admin on public.custom_role_permissions
  for insert with check (public.fn_is_admin());

create policy crp_delete_admin on public.custom_role_permissions
  for delete using (public.fn_is_admin());
