-- ============================================================================
-- outbound_emails — registro de correos enviados desde el admin
-- ============================================================================
--
-- PM 2026-07-02: el cliente pidió que los correos enviados desde el sistema
-- se vean en el Buzón. Antes el modal "Redactar correo" solo guardaba en
-- localStorage (perdido al cambiar de máquina) y no enviaba realmente.
--
-- Ahora cada envío queda persistido acá con: destinatario, asunto, body,
-- estado del envío por Resend, id del mensaje si fue exitoso.
-- ============================================================================

create table if not exists public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  to_address text not null,
  to_name text,
  subject text not null,
  body_text text not null,
  body_html text,
  provider text not null default 'resend',
  provider_message_id text,                   -- id devuelto por Resend en caso ok
  status text not null,                       -- 'sent' | 'skipped' | 'failed'
  status_reason text,                         -- error o motivo del skip
  sent_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz not null default now(),
  kind text,                                  -- 'compose' | 'invoice' | 'password_reset' | otros
  invoice_id uuid references public.invoices(id) on delete set null
);

comment on table public.outbound_emails is
  'Registro de correos salientes disparados desde el admin. Alimenta el tab Enviados del Buzón.';

create index if not exists outbound_emails_sent_at_idx
  on public.outbound_emails (sent_at desc);

create index if not exists outbound_emails_to_address_idx
  on public.outbound_emails (lower(to_address), sent_at desc);

alter table public.outbound_emails enable row level security;

drop policy if exists outbound_emails_staff_read on public.outbound_emails;
create policy outbound_emails_staff_read on public.outbound_emails
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Insert: cualquier admin autenticado. La server action valida guard.
drop policy if exists outbound_emails_staff_insert on public.outbound_emails;
create policy outbound_emails_staff_insert on public.outbound_emails
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
