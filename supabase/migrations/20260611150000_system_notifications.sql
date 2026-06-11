-- ============================================================================
-- 0021 — Notificaciones del sistema (in-app, sin email/push)
-- ============================================================================
--
-- PM 2026-06-11: en lugar de mandar emails o push, los eventos importantes
-- (nueva reserva, pago, factura, etc.) generan una notificación in-app que
-- el admin ve al entrar al panel (con un efecto de sonido si hay nuevas).
--
-- Tabla:
--   notifications
--     - recipient_id: a quién va dirigida (FK a profiles).
--     - kind: ej. 'new_booking', 'successful_payment', 'new_review'.
--     - title_es/title_en + body_es/body_en: contenido bilingüe.
--     - link: ruta opcional a navegar al hacer click.
--     - read_at: NULL → no leída. Una vez marcada, se queda en histórico.
--
-- RLS:
--   - SELECT: el receptor (o un admin) pueden ver.
--   - INSERT: solo staff (los eventos los crea el sistema / server actions).
--   - UPDATE/DELETE: solo el receptor.
-- ============================================================================

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  kind          text not null,
  title_es      text not null,
  title_en      text not null,
  body_es       text,
  body_en       text,
  link          text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_id, created_at desc);

comment on table public.notifications is
  'Notificaciones in-app del panel admin. Sin email/push — se ven en el bell del header con sonido si hay nuevas.';

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select using (recipient_id = auth.uid() or public.fn_is_admin());

create policy notifications_insert_staff on public.notifications
  for insert with check (public.fn_is_staff());

create policy notifications_update_own on public.notifications
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy notifications_delete_own on public.notifications
  for delete using (recipient_id = auth.uid());

-- Preferencias por usuario: qué tipos quiere recibir. JSON simple para
-- evitar otra tabla. Default: todos activos.
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

comment on column public.profiles.notification_prefs is
  'Prefs in-app por kind: {"new_booking":true,"daily_report":false,...}. Default vacío = todos activos.';
