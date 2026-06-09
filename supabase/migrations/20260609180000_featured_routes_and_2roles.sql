-- ============================================================================
-- 0014 — transfer_routes.featured + reducción de roles a 2 (admin + user)
-- ============================================================================
--
-- PM 2026-06-09:
--   * Las rutas de traslado solo son "populares" si el admin las marca.
--     Agregar columna `featured` y default false. La sección "Popular Routes"
--     del público filtrará por featured = true.
--   * El sistema solo necesita 2 roles: ADMIN y CLIENTE. El rol 'employee'
--     introducido pre-pivote queda obsoleto (permisos granulares dejan de
--     usarse en el modelo catálogo+referral, todo lo administrativo recae
--     en el admin).
-- ============================================================================

-- ─── transfer_routes.featured ───────────────────────────────────────────────
alter table public.transfer_routes
  add column if not exists featured boolean not null default false;

create index if not exists transfer_routes_featured_idx
  on public.transfer_routes(featured) where featured = true;

-- ─── Reducción de roles a 2 ────────────────────────────────────────────────
-- 1) Demote filas existentes con role='employee' → 'user'. Si el cliente
--    necesita que un employee preserve acceso admin, lo promueve manualmente
--    desde el dashboard.
update public.profiles
set role = 'user'
where role = 'employee';

-- 2) Recrear enum sin 'employee'. Postgres no permite REMOVE de enum value,
--    así que: crear enum nuevo, alter column, drop viejo, rename.
do $$
begin
  if exists (
    select 1 from pg_type t
    where t.typname = 'user_role'
      and exists (
        select 1 from pg_enum e
        where e.enumtypid = t.oid and e.enumlabel = 'employee'
      )
  ) then
    create type public.user_role_new as enum ('admin', 'user');

    alter table public.profiles
      alter column role drop default;
    alter table public.profiles
      alter column role type public.user_role_new
      using role::text::public.user_role_new;
    alter table public.profiles
      alter column role set default 'user'::public.user_role_new;

    drop function if exists public.fn_current_role();

    drop type public.user_role;
    alter type public.user_role_new rename to user_role;

    create or replace function public.fn_current_role()
    returns public.user_role
    language sql
    stable
    security definer
    set search_path = public
    as $f$
      select role from public.profiles where id = auth.uid();
    $f$;
  end if;
end $$;

-- 3) fn_is_staff: ahora solo admin es staff (employee ya no existe).
create or replace function public.fn_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) = 'admin',
    false
  );
$$;
