-- ============================================================================
-- 0003 — Tablas de dominio de negocio + RLS + indexes
-- ============================================================================

-- ─── STAYS ──────────────────────────────────────────────────────────────────
create table public.stays (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title_es        text not null,
  title_en        text,
  short_desc_es   text,
  short_desc_en   text,
  description_es  text,
  description_en  text,
  location        text,
  lat             numeric(9,6),
  lng             numeric(9,6),
  price_cents     integer not null check (price_cents >= 0),
  max_guests      integer not null default 1 check (max_guests > 0),
  bedrooms        integer not null default 0,
  bathrooms       integer not null default 0,
  amenities       jsonb   not null default '[]'::jsonb,
  images          jsonb   not null default '[]'::jsonb,
  featured        boolean not null default false,
  active          boolean not null default true,
  rating_avg      numeric(3,2) not null default 0,
  rating_count    integer not null default 0,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index stays_active_idx   on public.stays(active);
create index stays_featured_idx on public.stays(featured) where featured = true;
create trigger stays_set_updated_at before update on public.stays
  for each row execute function public.tg_set_updated_at();

-- ─── TOURS ──────────────────────────────────────────────────────────────────
create table public.tours (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title_es        text not null,
  title_en        text,
  short_desc_es   text,
  short_desc_en   text,
  description_es  text,
  description_en  text,
  location        text,
  meeting_point   text,
  lat             numeric(9,6),
  lng             numeric(9,6),
  duration_minutes integer not null check (duration_minutes > 0),
  max_pax         integer not null default 10 check (max_pax > 0),
  price_cents     integer not null check (price_cents >= 0),
  difficulty      text,
  includes        jsonb   not null default '[]'::jsonb,
  images          jsonb   not null default '[]'::jsonb,
  featured        boolean not null default false,
  active          boolean not null default true,
  rating_avg      numeric(3,2) not null default 0,
  rating_count    integer not null default 0,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index tours_active_idx on public.tours(active);
create trigger tours_set_updated_at before update on public.tours
  for each row execute function public.tg_set_updated_at();

-- ─── TRANSFERS ──────────────────────────────────────────────────────────────
create table public.transfer_routes (
  id              uuid primary key default gen_random_uuid(),
  from_location   text not null,
  to_location     text not null,
  distance_km     numeric(7,2),
  duration_minutes integer,
  base_price_cents integer not null check (base_price_cents >= 0),
  max_pax         integer not null default 4,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (from_location, to_location)
);
create trigger transfer_routes_set_updated_at before update on public.transfer_routes
  for each row execute function public.tg_set_updated_at();

create table public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text,
  max_pax         integer not null default 4,
  max_luggage     integer not null default 2,
  price_cents     integer,
  image           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger vehicles_set_updated_at before update on public.vehicles
  for each row execute function public.tg_set_updated_at();

-- ─── BOOKINGS ───────────────────────────────────────────────────────────────
create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete restrict,
  item_type         public.item_type not null,
  stay_id           uuid references public.stays(id) on delete restrict,
  tour_id           uuid references public.tours(id) on delete restrict,
  transfer_route_id uuid references public.transfer_routes(id) on delete restrict,
  vehicle_id        uuid references public.vehicles(id) on delete set null,
  start_date        date not null,
  end_date          date,
  start_time        time,
  pax               integer not null default 1 check (pax > 0),
  total_cents       integer not null check (total_cents >= 0),
  notes             text,
  status            public.booking_status not null default 'pending',
  confirmed_at      timestamptz,
  cancelled_at      timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Exactamente uno de los tres FKs debe estar set, acorde a item_type.
  constraint bookings_item_consistency check (
    case item_type
      when 'stay'     then stay_id is not null and tour_id is null and transfer_route_id is null
      when 'tour'     then tour_id is not null and stay_id is null and transfer_route_id is null
      when 'transfer' then transfer_route_id is not null and stay_id is null and tour_id is null
    end
  )
);
create index bookings_user_idx       on public.bookings(user_id);
create index bookings_status_idx     on public.bookings(status);
create index bookings_start_date_idx on public.bookings(start_date);
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.tg_set_updated_at();

-- ─── PAYMENTS ───────────────────────────────────────────────────────────────
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  method          public.payment_method not null,
  amount_cents    integer not null check (amount_cents >= 0),
  status          public.payment_status not null default 'pending',
  external_ref    text,
  receipt_url     text,
  notes           text,
  claimed_at      timestamptz,
  confirmed_at    timestamptz,
  rejected_at     timestamptz,
  confirmed_by    uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index payments_booking_idx on public.payments(booking_id);
create index payments_status_idx  on public.payments(status);
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.tg_set_updated_at();

-- ─── REVIEWS ────────────────────────────────────────────────────────────────
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_type   public.item_type not null,
  item_id     uuid not null,
  rating      integer not null check (rating between 1 and 5),
  title       text,
  body        text,
  status      public.content_status not null default 'draft',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index reviews_item_idx on public.reviews(item_type, item_id);
create index reviews_status_idx on public.reviews(status);
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.tg_set_updated_at();

-- ─── POSTS (blog) ───────────────────────────────────────────────────────────
create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title_es      text not null,
  title_en      text,
  excerpt_es    text,
  excerpt_en    text,
  body_es       text,
  body_en       text,
  category      text,
  author_id     uuid references public.profiles(id) on delete set null,
  featured      boolean not null default false,
  status        public.content_status not null default 'draft',
  scheduled_at  timestamptz,
  published_at  timestamptz,
  image         text,
  views         integer not null default 0,
  tags          jsonb   not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index posts_status_idx        on public.posts(status);
create index posts_published_at_idx  on public.posts(published_at);
create trigger posts_set_updated_at before update on public.posts
  for each row execute function public.tg_set_updated_at();

-- ─── CART ITEMS (pre-checkout) ──────────────────────────────────────────────
create table public.cart_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  item_type         public.item_type not null,
  stay_id           uuid references public.stays(id) on delete cascade,
  tour_id           uuid references public.tours(id) on delete cascade,
  transfer_route_id uuid references public.transfer_routes(id) on delete cascade,
  start_date        date,
  end_date          date,
  pax               integer not null default 1 check (pax > 0),
  notes             text,
  created_at        timestamptz not null default now()
);
create index cart_items_user_idx on public.cart_items(user_id);

-- ─── CONTACT MESSAGES (formulario público) ──────────────────────────────────
create table public.contact_messages (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  phone        text,
  message      text not null,
  status       text not null default 'new' check (status in ('new', 'read', 'replied', 'spam')),
  replied_at   timestamptz,
  replied_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index contact_messages_status_idx on public.contact_messages(status);

-- ─── AUDIT LOG (acciones admin) ─────────────────────────────────────────────
create table public.audit_log (
  id           bigserial primary key,
  actor_id     uuid references public.profiles(id) on delete set null,
  action       text not null,
  target_type  text,
  target_id    text,
  payload      jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_actor_idx on public.audit_log(actor_id);
create index audit_log_action_idx on public.audit_log(action);

-- ============================================================================
-- Trigger de loyalty: al pasar booking a 'completed', sumar puntos al usuario.
-- ============================================================================
create or replace function public.tg_award_points_on_booking_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pts integer;
begin
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then
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

create trigger bookings_award_points
  after update on public.bookings
  for each row execute function public.tg_award_points_on_booking_completed();

-- ============================================================================
-- RLS
-- ============================================================================

-- Catálogo público (stays, tours, transfer_routes, vehicles): lectura abierta de activos.
alter table public.stays           enable row level security;
alter table public.tours           enable row level security;
alter table public.transfer_routes enable row level security;
alter table public.vehicles        enable row level security;

create policy stays_public_read           on public.stays           for select using (active = true or public.fn_is_staff());
create policy tours_public_read           on public.tours           for select using (active = true or public.fn_is_staff());
create policy transfer_routes_public_read on public.transfer_routes for select using (active = true or public.fn_is_staff());
create policy vehicles_public_read        on public.vehicles        for select using (active = true or public.fn_is_staff());

create policy stays_staff_write           on public.stays           for all using (public.fn_is_staff()) with check (public.fn_is_staff());
create policy tours_staff_write           on public.tours           for all using (public.fn_is_staff()) with check (public.fn_is_staff());
create policy transfer_routes_staff_write on public.transfer_routes for all using (public.fn_is_staff()) with check (public.fn_is_staff());
create policy vehicles_staff_write        on public.vehicles        for all using (public.fn_is_staff()) with check (public.fn_is_staff());

-- Bookings: dueño ve y crea sus propios; staff ve y modifica todos.
alter table public.bookings enable row level security;
create policy bookings_select_own_or_staff on public.bookings
  for select using (auth.uid() = user_id or public.fn_is_staff());
create policy bookings_insert_own on public.bookings
  for insert with check (auth.uid() = user_id);
create policy bookings_update_staff on public.bookings
  for update using (public.fn_is_staff()) with check (public.fn_is_staff());

-- Payments: lectura para el dueño del booking + staff; escritura solo staff.
alter table public.payments enable row level security;
create policy payments_select_own_or_staff on public.payments
  for select using (
    public.fn_is_staff()
    or exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid())
  );
create policy payments_insert_own_or_staff on public.payments
  for insert with check (
    public.fn_is_staff()
    or exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid())
  );
create policy payments_update_staff on public.payments
  for update using (public.fn_is_staff()) with check (public.fn_is_staff());

-- Reviews: lectura pública solo de aprobadas; insert dueño; aprobación staff.
alter table public.reviews enable row level security;
create policy reviews_public_read_published on public.reviews
  for select using (status = 'published' or auth.uid() = user_id or public.fn_is_staff());
create policy reviews_insert_own on public.reviews
  for insert with check (auth.uid() = user_id);
create policy reviews_update_own_or_staff on public.reviews
  for update using (auth.uid() = user_id or public.fn_is_staff());

-- Posts: lectura pública solo publicados; escritura staff.
alter table public.posts enable row level security;
create policy posts_public_read_published on public.posts
  for select using (status = 'published' or public.fn_is_staff());
create policy posts_staff_write on public.posts
  for all using (public.fn_is_staff()) with check (public.fn_is_staff());

-- Cart items: scope estricto al usuario.
alter table public.cart_items enable row level security;
create policy cart_items_self_all on public.cart_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Contact messages: insert público (anónimo), lectura solo staff.
alter table public.contact_messages enable row level security;
create policy contact_messages_public_insert on public.contact_messages
  for insert with check (true);
create policy contact_messages_staff_read on public.contact_messages
  for select using (public.fn_is_staff());
create policy contact_messages_staff_update on public.contact_messages
  for update using (public.fn_is_staff()) with check (public.fn_is_staff());

-- Audit log: solo admin lee; escritura desde código server con service_role.
alter table public.audit_log enable row level security;
create policy audit_log_admin_read on public.audit_log
  for select using (public.fn_is_admin());
