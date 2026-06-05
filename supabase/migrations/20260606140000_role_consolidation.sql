-- ============================================================================
-- 0013 — Consolidación de roles a 3 valores
-- ============================================================================
--
-- El PM definió que solo necesitamos 3 roles:
--   * admin     → Administrador (todos los permisos)
--   * employee  → Empleado (staff con permisos granulares)
--   * user      → Cliente/Usuario
--
-- El valor 'manager' del enum se elimina. Las filas con role='manager' se
-- migran a 'employee' (los managers eran empleados con permisos extra que
-- ahora se administran granularmente vía la tabla permissions).
--
-- Cambios:
--   * Recrear enum user_role sin 'manager'.
--   * Migrar filas existentes manager → employee.
--   * Actualizar fn_is_staff (ya no chequea 'manager').
--
-- IDEMPOTENTE: usa `do $$ begin … end $$` para guards y `if not exists`.
-- ============================================================================

-- 1) Migrar datos existentes (antes de tocar el enum, mientras 'manager'
--    sigue siendo válido).
update public.profiles
set role = 'employee'
where role = 'manager';

-- 2) Postgres no permite REMOVER valores de un enum directamente. Patrón:
--    crear enum nuevo, cambiar la columna, dropear viejo, renombrar nuevo.
do $$
begin
  if exists (
    select 1 from pg_type t
    where t.typname = 'user_role'
      and exists (
        select 1 from pg_enum e
        where e.enumtypid = t.oid and e.enumlabel = 'manager'
      )
  ) then
    -- Crear enum nuevo
    create type public.user_role_new as enum ('admin', 'employee', 'user');

    -- Cambiar columna profiles.role al enum nuevo
    alter table public.profiles
      alter column role drop default;
    alter table public.profiles
      alter column role type public.user_role_new
      using role::text::public.user_role_new;
    alter table public.profiles
      alter column role set default 'user'::public.user_role_new;

    -- Recrear las funciones helper que devuelven user_role (deben rebindearse
    -- al tipo nuevo). Las droppeamos antes del rename para evitar dependencias.
    drop function if exists public.fn_current_role();

    -- Dropear viejo y renombrar nuevo
    drop type public.user_role;
    alter type public.user_role_new rename to user_role;

    -- Re-crear fn_current_role apuntando al enum recién renombrado.
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

-- 3) Actualizar fn_is_staff: el chequeo a 'manager' deja de aplicar.
create or replace function public.fn_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('admin', 'employee'),
    false
  );
$$;

-- fn_is_admin no cambia (sigue chequeando = 'admin').
