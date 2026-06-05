-- ============================================================================
-- 0012 — Tabla `site_settings` (key-value para configuración global)
-- ============================================================================
--
-- Almacena valores configurables desde el panel admin (teléfono de contacto,
-- WhatsApp del negocio, email, etc.) en vez de hardcodearlos en el código.
-- Modelo simple key-value para flexibilidad: el admin puede agregar nuevas
-- keys sin migraciones.
--
-- RLS:
--   * SELECT: público (cualquiera puede leer — son datos de contacto y
--     branding visibles en el sitio). NO almacenar nada sensible acá.
--   * UPDATE/INSERT: solo admin (fn_is_admin). Sin DELETE — las keys se
--     dejan vacías en vez de borrarlas, para evitar referencias rotas en UI.
-- ============================================================================

create table public.site_settings (
  key         text primary key,
  value       text not null default '',
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

comment on table public.site_settings is
  'Configuración global del sitio (KV). Editable por admin. SELECT público.';

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.tg_set_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────────
alter table public.site_settings enable row level security;

create policy site_settings_select_public on public.site_settings
  for select using (true);

create policy site_settings_insert_admin on public.site_settings
  for insert with check (public.fn_is_admin());

create policy site_settings_update_admin on public.site_settings
  for update using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ─── Seeds iniciales (defaults actuales hardcoded en el JSX) ──────────────
-- Solo INSERTAMOS si la key no existe (idempotente). El admin puede sobre-
-- escribir los valores desde el panel.
insert into public.site_settings (key, value, description) values
  ('whatsapp_phone',
   '17872379519',
   'Número WhatsApp del negocio (sin + ni guiones). Usado en wa.me links del sitio público.'),
  ('contact_phone',
   '+1 (787) 237-9519',
   'Teléfono de contacto formateado para mostrar en footer/contact.'),
  ('contact_phone_tel',
   '+17872379519',
   'Teléfono en formato tel: (sin formato visual) para enlaces clickables en mobile.'),
  ('contact_email',
   'info@prdise.com',
   'Email principal de contacto del negocio.')
on conflict (key) do nothing;

-- ─── Permisos granulares: ya existe 'settings:read' y 'settings:write' ─────
-- No agregamos nada nuevo; estos permisos cubren el módulo Settings completo.
