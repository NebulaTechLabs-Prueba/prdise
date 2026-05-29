-- ============================================================================
-- 0010 — Tabla `invoices` para gestión de facturas
-- ============================================================================
--
-- Una invoice agrupa una o más bookings del mismo cliente en un solo documento
-- contable. Generada automáticamente tras cada checkout (1 invoice por sesión
-- de carrito) y referenciada en el módulo Invoices del admin.
--
-- RLS:
--   * SELECT: dueño + staff.
--   * INSERT: usuarios autenticados (al pagar) + staff.
--   * UPDATE: solo staff (cambiar status, marcar paid, etc.).
-- ============================================================================

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique,            -- ej "INV-2026-001"
  user_id         uuid not null references public.profiles(id) on delete cascade,
  customer_name   text not null,
  customer_email  text not null,
  customer_phone  text,
  issued_at       date not null default current_date,
  due_at          date,
  paid_at         timestamptz,
  subtotal_cents  integer not null check (subtotal_cents >= 0),
  discount_cents  integer not null default 0 check (discount_cents >= 0),
  tax_cents       integer not null default 0 check (tax_cents >= 0),
  total_cents     integer not null check (total_cents >= 0),
  status          text not null default 'sent'
                  check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded')),
  payment_ref     text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.invoices is
  'Facturas generadas tras cada checkout. Agrupan bookings del cliente.';

create index invoices_user_idx      on public.invoices(user_id);
create index invoices_status_idx    on public.invoices(status);
create index invoices_issued_idx    on public.invoices(issued_at desc);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.tg_set_updated_at();

-- ─── Línea por booking ──────────────────────────────────────────────────────
create table public.invoice_items (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  booking_id      uuid references public.bookings(id) on delete set null,
  description     text not null,
  quantity        integer not null default 1 check (quantity > 0),
  unit_cents      integer not null check (unit_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  created_at      timestamptz not null default now()
);

create index invoice_items_invoice_idx on public.invoice_items(invoice_id);
create index invoice_items_booking_idx on public.invoice_items(booking_id);

-- ─── RLS: invoices ──────────────────────────────────────────────────────────
alter table public.invoices enable row level security;

create policy invoices_select_own_or_staff on public.invoices
  for select using (user_id = auth.uid() or public.fn_is_staff());

create policy invoices_insert_own_or_staff on public.invoices
  for insert with check (user_id = auth.uid() or public.fn_is_staff());

create policy invoices_update_staff on public.invoices
  for update using (public.fn_is_staff()) with check (public.fn_is_staff());

-- ─── RLS: invoice_items ─────────────────────────────────────────────────────
alter table public.invoice_items enable row level security;

create policy invoice_items_select_via_invoice on public.invoice_items
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
      and (i.user_id = auth.uid() or public.fn_is_staff())
    )
  );

create policy invoice_items_insert_via_invoice on public.invoice_items
  for insert with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
      and (i.user_id = auth.uid() or public.fn_is_staff())
    )
  );

-- ─── Permisos granulares ────────────────────────────────────────────────────
alter table public.permissions drop constraint permissions_area_check;
alter table public.permissions add constraint permissions_area_check check (
  area in ('stays','tours','transfers','payments','bookings','users','posts','reviews','settings','partners','invoices')
);

insert into public.permissions (key, label_es, label_en, description_es, description_en, area) values
  ('invoices:read',   'Ver facturas',          'View invoices',
   'Permite consultar facturas emitidas a clientes.',
   'Allows viewing invoices issued to customers.',
   'invoices'),
  ('invoices:write',  'Crear/editar facturas', 'Create/edit invoices',
   'Permite crear y modificar facturas (cambiar status, registrar pago, etc.).',
   'Allows creating and modifying invoices.',
   'invoices');
