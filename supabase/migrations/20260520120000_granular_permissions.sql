-- ============================================================================
-- 0004 — Permisos granulares para roles manager / employee
-- ============================================================================
--
-- Modelo:
--   * Catálogo de permisos disponibles (tabla `permissions`).
--   * Asignación N:N entre profiles y permissions (tabla `user_permissions`).
--   * `admin` recibe TODO por default (cortocircuito en fn_has_permission).
--   * `manager` / `employee` reciben permisos individuales asignables/revocables
--     por un admin desde la UI con confirmación explícita.
--
-- Las migraciones previas (20260511*) deben estar aplicadas: este archivo
-- depende de public.profiles, public.fn_is_admin y public.fn_is_staff.
-- ============================================================================

-- ─── CATÁLOGO DE PERMISOS ───────────────────────────────────────────────────
create table public.permissions (
  key             text primary key,
  label_es        text not null,
  label_en        text not null,
  description_es  text not null,
  description_en  text not null,
  area            text not null check (
    area in ('stays','tours','transfers','payments','bookings','users','posts','reviews','settings')
  ),
  created_at      timestamptz not null default now()
);

comment on table public.permissions is
  'Catálogo de permisos granulares asignables a managers y employees. El admin recibe todos por default.';

create index permissions_area_idx on public.permissions(area);

-- ─── ASIGNACIÓN POR USUARIO ─────────────────────────────────────────────────
create table public.user_permissions (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  granted_by     uuid references public.profiles(id) on delete set null,
  granted_at     timestamptz not null default now(),
  primary key (user_id, permission_key)
);

comment on table public.user_permissions is
  'Permisos granulares concedidos a un profile. Solo aplica a manager/employee; admin tiene todo.';

create index user_permissions_user_idx       on public.user_permissions(user_id);
create index user_permissions_permission_idx on public.user_permissions(permission_key);

-- ─── HELPER RLS: fn_has_permission ──────────────────────────────────────────
-- Retorna true si:
--   * el caller es admin (acceso total), O
--   * existe fila en user_permissions para auth.uid() + perm_key.
-- ----------------------------------------------------------------------------
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
      select 1
        from public.user_permissions up
       where up.user_id = auth.uid()
         and up.permission_key = perm_key
    );
$$;

comment on function public.fn_has_permission(text) is
  'True si el caller es admin o tiene el permiso granular asignado en user_permissions.';

-- ─── SEED CATÁLOGO INICIAL ──────────────────────────────────────────────────
insert into public.permissions (key, label_es, label_en, description_es, description_en, area) values
  ('stays:read',         'Ver alojamientos',        'View stays',
   'Permite ver el listado y detalles de alojamientos en el panel admin.',
   'Allows viewing the list and details of stays in the admin panel.',
   'stays'),
  ('stays:write',        'Crear/editar alojamientos','Create/edit stays',
   'Permite crear y modificar alojamientos del catálogo.',
   'Allows creating and modifying stays in the catalog.',
   'stays'),
  ('stays:delete',       'Eliminar alojamientos',   'Delete stays',
   'Permite dar de baja (soft delete) un alojamiento.',
   'Allows deactivating (soft delete) a stay.',
   'stays'),

  ('tours:read',         'Ver tours',               'View tours',
   'Permite ver el listado y detalles de tours en el panel admin.',
   'Allows viewing the list and details of tours in the admin panel.',
   'tours'),
  ('tours:write',        'Crear/editar tours',      'Create/edit tours',
   'Permite crear y modificar tours del catálogo.',
   'Allows creating and modifying tours in the catalog.',
   'tours'),
  ('tours:delete',       'Eliminar tours',          'Delete tours',
   'Permite dar de baja (soft delete) un tour.',
   'Allows deactivating (soft delete) a tour.',
   'tours'),

  ('transfers:read',     'Ver traslados',           'View transfers',
   'Permite ver rutas y vehículos de traslados.',
   'Allows viewing transfer routes and vehicles.',
   'transfers'),
  ('transfers:write',    'Crear/editar traslados',  'Create/edit transfers',
   'Permite crear y modificar rutas y vehículos de traslados.',
   'Allows creating and modifying transfer routes and vehicles.',
   'transfers'),
  ('transfers:delete',   'Eliminar traslados',      'Delete transfers',
   'Permite dar de baja (soft delete) rutas o vehículos.',
   'Allows deactivating (soft delete) routes or vehicles.',
   'transfers'),

  ('payments:read',      'Ver pagos',               'View payments',
   'Permite consultar pagos y comprobantes.',
   'Allows viewing payments and receipts.',
   'payments'),
  ('payments:confirm',   'Confirmar pagos offline', 'Confirm offline payments',
   'Permite confirmar pagos offline (ATH Móvil / transferencia bancaria).',
   'Allows confirming offline payments (ATH Móvil / bank transfer).',
   'payments'),
  ('payments:reject',    'Rechazar pagos offline',  'Reject offline payments',
   'Permite rechazar reclamos de pago offline.',
   'Allows rejecting offline payment claims.',
   'payments'),

  ('bookings:read',      'Ver reservas',            'View bookings',
   'Permite ver el listado completo de reservas.',
   'Allows viewing the complete list of bookings.',
   'bookings'),
  ('bookings:update',    'Actualizar reservas',     'Update bookings',
   'Permite cambiar estado, cancelar o completar reservas.',
   'Allows changing status, cancelling or completing bookings.',
   'bookings'),

  ('users:read',         'Ver usuarios',            'View users',
   'Permite ver el listado y detalle de usuarios.',
   'Allows viewing the list and detail of users.',
   'users'),
  ('users:edit_role',    'Editar rol de usuarios',  'Edit user roles',
   'Permite cambiar el rol de un usuario (admin/manager/employee/user).',
   'Allows changing a user role (admin/manager/employee/user).',
   'users'),

  ('posts:read',         'Ver posts',               'View posts',
   'Permite ver el listado completo de posts (incluye borradores).',
   'Allows viewing the full list of posts (including drafts).',
   'posts'),
  ('posts:write',        'Crear/editar posts',      'Create/edit posts',
   'Permite crear y modificar posts del blog.',
   'Allows creating and modifying blog posts.',
   'posts'),
  ('posts:publish',      'Publicar posts',          'Publish posts',
   'Permite cambiar el estado de un post a publicado o archivado.',
   'Allows changing a post status to published or archived.',
   'posts'),

  ('reviews:read',       'Ver reseñas',             'View reviews',
   'Permite ver todas las reseñas, incluso pendientes de aprobación.',
   'Allows viewing all reviews, including those pending approval.',
   'reviews'),
  ('reviews:approve',    'Aprobar reseñas',         'Approve reviews',
   'Permite aprobar o rechazar reseñas enviadas por usuarios.',
   'Allows approving or rejecting reviews submitted by users.',
   'reviews'),

  ('settings:read',      'Ver configuración',       'View settings',
   'Permite ver la configuración de la plataforma.',
   'Allows viewing platform settings.',
   'settings'),
  ('settings:write',     'Editar configuración',    'Edit settings',
   'Permite modificar la configuración de la plataforma.',
   'Allows modifying platform settings.',
   'settings');

-- ─── RLS: permissions (catálogo) ────────────────────────────────────────────
alter table public.permissions enable row level security;

-- Lectura: cualquier usuario autenticado puede leer el catálogo (lo necesita la UI).
create policy permissions_authenticated_read on public.permissions
  for select using (auth.uid() is not null);

-- Escritura: solo admin (en la práctica el catálogo se mantiene vía migraciones,
-- pero dejamos abierto a admin para futuras adiciones desde un panel).
create policy permissions_admin_write on public.permissions
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ─── RLS: user_permissions (asignación) ─────────────────────────────────────
alter table public.user_permissions enable row level security;

-- Lectura: el dueño ve sus propias asignaciones; staff ve todas
-- (manager/employee necesitan ver permisos para auto-conocimiento; admin igual).
create policy user_permissions_select_own_or_staff on public.user_permissions
  for select using (
    user_id = auth.uid()
    or public.fn_is_staff()
  );

-- Escritura: solo admin puede otorgar / revocar permisos.
create policy user_permissions_admin_write on public.user_permissions
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());
