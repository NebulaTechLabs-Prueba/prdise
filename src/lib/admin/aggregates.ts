"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaffOrRedirect } from "./_shared";
import type { Database } from "@/lib/supabase/database.types";

// ─── Tipos públicos ─────────────────────────────────────────────────────────

type BookingStatus = Database["public"]["Enums"]["booking_status"];
type ItemType = Database["public"]["Enums"]["item_type"];

export type DashboardSummary = {
  revenueCents: number;
  bookingsCount: number;
  activeStaysCount: number;
  newUsersCount: number;
  deltas: {
    revenuePct: number | null;
    bookingsPct: number | null;
    newUsersPct: number | null;
  };
  rangeDays: number;
  rangeStart: string;
  rangeEnd: string;
};

export type RecentBookingCustomer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export type RecentBooking = {
  id: string;
  created_at: string;
  start_date: string;
  end_date: string | null;
  item_type: ItemType;
  status: BookingStatus;
  total_cents: number;
  pax: number;
  customer: RecentBookingCustomer | null;
  product_title: string | null;
};

export type RevenueBucket = {
  label: string;
  revenue: number;
  start: string;
  end: string;
};

export type BookingsByStatus = Record<BookingStatus, number>;

// ─── Helpers internos ───────────────────────────────────────────────────────

const ALL_STATUSES: BookingStatus[] = [
  "pending",
  "pending_payment",
  "confirmed",
  "cancelled",
  "completed",
  "refunded",
];

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    // Sin baseline previa no podemos calcular %. Devolvemos null para que el
    // UI decida cómo mostrarlo (ej. "—" o "nuevo").
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}

function isoAtMidnightUtcDaysAgo(days: number): string {
  const now = new Date();
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  utc.setUTCDate(utc.getUTCDate() - days);
  return utc.toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

function clampRangeDays(rangeDays: number | undefined, fallback = 30): number {
  if (typeof rangeDays !== "number" || !Number.isFinite(rangeDays)) {
    return fallback;
  }
  const n = Math.floor(rangeDays);
  if (n < 1) return 1;
  if (n > 365) return 365;
  return n;
}

function clampBucketCount(bucketCount: number | undefined, fallback = 8): number {
  if (typeof bucketCount !== "number" || !Number.isFinite(bucketCount)) {
    return fallback;
  }
  const n = Math.floor(bucketCount);
  if (n < 1) return 1;
  if (n > 60) return 60;
  return n;
}

// ─── getDashboardSummary ────────────────────────────────────────────────────

/**
 * KPIs principales del dashboard admin. Compara el rango actual de
 * `rangeDays` días contra el rango anterior del mismo tamaño para calcular
 * deltas porcentuales.
 *
 * - revenueCents: suma de `payments.amount_cents` con status='confirmed'
 *   confirmados en el rango (usa `confirmed_at`, fallback a `created_at`).
 * - bookingsCount: bookings creadas en el rango.
 * - activeStaysCount: stays con `active=true` (snapshot, sin rango).
 * - newUsersCount: profiles creados en el rango.
 */
export async function getDashboardSummary(
  opts: { rangeDays?: number } = {}
): Promise<DashboardSummary> {
  await requireStaffOrRedirect();
  const supabase = await createClient();

  const rangeDays = clampRangeDays(opts.rangeDays, 30);
  const end = nowIso();
  const start = isoAtMidnightUtcDaysAgo(rangeDays);
  const prevStart = isoAtMidnightUtcDaysAgo(rangeDays * 2);
  const prevEnd = start;

  // Revenue (current + previous) — payments confirmados.
  const [revCurr, revPrev] = await Promise.all([
    supabase
      .from("payments")
      .select("amount_cents, confirmed_at, created_at, status")
      .eq("status", "confirmed")
      .gte("confirmed_at", start)
      .lte("confirmed_at", end),
    supabase
      .from("payments")
      .select("amount_cents, confirmed_at, created_at, status")
      .eq("status", "confirmed")
      .gte("confirmed_at", prevStart)
      .lt("confirmed_at", prevEnd),
  ]);

  const revenueCents = (revCurr.data ?? []).reduce(
    (acc, p) => acc + (p.amount_cents ?? 0),
    0
  );
  const revenuePrevCents = (revPrev.data ?? []).reduce(
    (acc, p) => acc + (p.amount_cents ?? 0),
    0
  );

  // Bookings counts (current + previous).
  const [bkCurr, bkPrev] = await Promise.all([
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start)
      .lte("created_at", end),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .gte("created_at", prevStart)
      .lt("created_at", prevEnd),
  ]);

  const bookingsCount = bkCurr.count ?? 0;
  const bookingsPrevCount = bkPrev.count ?? 0;

  // Active stays — snapshot, no rango.
  const stays = await supabase
    .from("stays")
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  const activeStaysCount = stays.count ?? 0;

  // New users (current + previous).
  const [usCurr, usPrev] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start)
      .lte("created_at", end),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", prevStart)
      .lt("created_at", prevEnd),
  ]);

  const newUsersCount = usCurr.count ?? 0;
  const newUsersPrevCount = usPrev.count ?? 0;

  return {
    revenueCents,
    bookingsCount,
    activeStaysCount,
    newUsersCount,
    deltas: {
      revenuePct: pctDelta(revenueCents, revenuePrevCents),
      bookingsPct: pctDelta(bookingsCount, bookingsPrevCount),
      newUsersPct: pctDelta(newUsersCount, newUsersPrevCount),
    },
    rangeDays,
    rangeStart: start,
    rangeEnd: end,
  };
}

// ─── getRecentBookings ──────────────────────────────────────────────────────

type ProductTitleJoin = { title_es: string | null } | null;

/**
 * Últimas N bookings con info de cliente y título del producto. Como un
 * booking referencia UN solo producto (stay/tour/transfer_route) según
 * `item_type`, hacemos los tres joins LEFT y resolvemos el título según
 * el discriminador.
 */
export async function getRecentBookings(limit: number): Promise<RecentBooking[]> {
  await requireStaffOrRedirect();
  const supabase = await createClient();

  const safeLimit = Math.min(Math.max(Math.floor(limit ?? 10), 1), 100);

  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      id,
      created_at,
      start_date,
      end_date,
      item_type,
      status,
      total_cents,
      pax,
      user_id,
      stay_id,
      tour_id,
      transfer_route_id,
      customer:profiles!bookings_user_id_fkey ( id, first_name, last_name ),
      stay:stays!bookings_stay_id_fkey ( title_es ),
      tour:tours!bookings_tour_id_fkey ( title_es ),
      transfer_route:transfer_routes!bookings_transfer_route_id_fkey ( from_location, to_location )
    `
    )
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    created_at: string;
    start_date: string;
    end_date: string | null;
    item_type: ItemType;
    status: BookingStatus;
    total_cents: number;
    pax: number;
    customer: RecentBookingCustomer | null;
    stay: ProductTitleJoin;
    tour: ProductTitleJoin;
    transfer_route: { from_location: string | null; to_location: string | null } | null;
  }>).map((row) => {
    let product_title: string | null = null;
    if (row.item_type === "stay") {
      product_title = row.stay?.title_es ?? null;
    } else if (row.item_type === "tour") {
      product_title = row.tour?.title_es ?? null;
    } else if (row.item_type === "transfer") {
      const r = row.transfer_route;
      product_title = r
        ? [r.from_location, r.to_location].filter(Boolean).join(" → ") || null
        : null;
    }
    return {
      id: row.id,
      created_at: row.created_at,
      start_date: row.start_date,
      end_date: row.end_date,
      item_type: row.item_type,
      status: row.status,
      total_cents: row.total_cents,
      pax: row.pax,
      customer: row.customer,
      product_title,
    };
  });
}

// ─── getPendingPaymentsCount ────────────────────────────────────────────────

/**
 * Conteo rápido de payments en estado 'claimed' (esperando validación
 * manual por staff). Pensado para badges de alerta en el dashboard.
 */
export async function getPendingPaymentsCount(): Promise<number> {
  await requireStaffOrRedirect();
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "claimed");

  if (error) return 0;
  return count ?? 0;
}

// ─── getRevenueChart ────────────────────────────────────────────────────────

/**
 * Serie temporal de revenue (cents) agrupada en `bucketCount` segmentos.
 * Cada bucket cubre `rangeDays / bucketCount` días. Si rangeDays > 31
 * los buckets se etiquetan como rangos de fecha (ej. "Apr 1–7"); si no,
 * como días individuales.
 *
 * Trae todos los payments confirmados en el rango y los reparte en JS,
 * así evitamos depender de funciones SQL `date_trunc` que no están
 * accesibles vía PostgREST.
 */
export async function getRevenueChart(
  rangeDays: number,
  bucketCount: number
): Promise<RevenueBucket[]> {
  await requireStaffOrRedirect();
  const supabase = await createClient();

  const days = clampRangeDays(rangeDays, 30);
  const buckets = clampBucketCount(bucketCount, 8);
  const bucketSizeMs = (days / buckets) * 24 * 60 * 60 * 1000;

  const endMs = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  const { data, error } = await supabase
    .from("payments")
    .select("amount_cents, confirmed_at, status")
    .eq("status", "confirmed")
    .gte("confirmed_at", startIso)
    .lte("confirmed_at", endIso);

  // Inicializar buckets vacíos.
  const result: RevenueBucket[] = Array.from({ length: buckets }, (_, i) => {
    const bStart = new Date(startMs + i * bucketSizeMs);
    const bEnd = new Date(startMs + (i + 1) * bucketSizeMs);
    return {
      label: formatBucketLabel(bStart, bEnd, days <= 31),
      revenue: 0,
      start: bStart.toISOString(),
      end: bEnd.toISOString(),
    };
  });

  if (error || !data) return result;

  for (const row of data) {
    const t = row.confirmed_at ? Date.parse(row.confirmed_at) : NaN;
    if (!Number.isFinite(t)) continue;
    let idx = Math.floor((t - startMs) / bucketSizeMs);
    if (idx < 0) idx = 0;
    if (idx >= buckets) idx = buckets - 1;
    result[idx].revenue += row.amount_cents ?? 0;
  }

  return result;
}

function formatBucketLabel(start: Date, end: Date, daily: boolean): string {
  const monthShort = (d: Date) =>
    d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = (d: Date) => d.getUTCDate();
  if (daily) {
    return `${monthShort(start)} ${day(start)}`;
  }
  // bucket de varios días: "Apr 1–7"
  const endInclusive = new Date(end.getTime() - 1);
  const sameMonth = start.getUTCMonth() === endInclusive.getUTCMonth();
  if (sameMonth) {
    return `${monthShort(start)} ${day(start)}–${day(endInclusive)}`;
  }
  return `${monthShort(start)} ${day(start)}–${monthShort(endInclusive)} ${day(endInclusive)}`;
}

// ─── getBookingsByStatus ────────────────────────────────────────────────────

/**
 * Conteo de bookings agrupadas por status. Devuelve siempre un `Record`
 * con TODOS los estados conocidos (0 si no hay), para que el UI pueda
 * iterarlo sin checks de undefined.
 */
export async function getBookingsByStatus(): Promise<BookingsByStatus> {
  await requireStaffOrRedirect();
  const supabase = await createClient();

  const empty = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {} as BookingsByStatus);

  // Una sola query trayendo solo la columna `status`. Para volúmenes
  // grandes conviene refactorizar a un RPC `select status, count(*)`,
  // pero en el MVP esta tabla no debería superar miles de filas.
  const { data, error } = await supabase.from("bookings").select("status");
  if (error || !data) return empty;

  for (const row of data) {
    const s = row.status as BookingStatus;
    if (s in empty) {
      empty[s] += 1;
    }
  }
  return empty;
}
