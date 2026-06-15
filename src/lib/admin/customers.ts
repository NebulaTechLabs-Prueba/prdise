"use server";

/**
 * Customers: vista de clientes registrados (PM 2026-06-11). Reemplaza el
 * antiguo "Contactos y CRM": ya no es un CRM con leads del form de contacto,
 * ahora muestra la lista de clientes que se registraron vía /register y
 * agrega stats de inversión y frecuencia de servicios.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffWithPermissionOrError } from "./_shared";
import type { ActionResult } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type CustomerRow = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  country: string | null;
  birthDate: string | null;
  role: string;
  status: string;
  joinedAt: string;
  // Stats agregadas (PM 2026-06-11)
  totalInvestedCents: number;
  invoicesPaid: number;
  serviceCount: number;
  mostFrequentServiceType: string | null;
};

export async function listCustomers(): Promise<ActionResult<{ items: CustomerRow[] }>> {
  const guard = await getStaffWithPermissionOrError("users:read");
  if (!guard.ok) return guard;

  const supabase = await createClient();

  // 1) Profiles role='user' (los admins viven en Empleados y Roles).
  //    Antes la sección "Contactos" mergeaba con contact_messages y se
  //    quedaba sin ningún cliente porque el merge fallaba silenciosamente.
  //    Acá vamos directo a profiles y devolvemos todo en una sola response.
  const { data: profilesData, error: profilesErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(500);

  if (profilesErr) {
    return { ok: false, error: `No se pudieron cargar los clientes: ${profilesErr.message}` };
  }
  const profiles = (profilesData ?? []) as Profile[];

  // 2) Stats por cliente desde la vista customer_stats (paid invoices +
  //    service counts). Hacemos un solo SELECT por todos los user_ids para
  //    no caer en N+1.
  const ids = profiles.map((p) => p.id);
  const statsMap = new Map<string, {
    total_invested_cents: number;
    invoices_paid: number;
    service_count: number;
    most_frequent_service_type: string | null;
  }>();
  if (ids.length > 0) {
    const { data: statsData } = await supabase
      .from("customer_stats")
      .select("*")
      .in("user_id", ids);
    for (const s of statsData ?? []) {
      if (s.user_id) {
        statsMap.set(s.user_id, {
          total_invested_cents: Number(s.total_invested_cents ?? 0),
          invoices_paid: Number(s.invoices_paid ?? 0),
          service_count: Number(s.service_count ?? 0),
          most_frequent_service_type: s.most_frequent_service_type ?? null,
        });
      }
    }
  }

  // 3) Emails desde auth.users (solo posible con service_role). Best-effort.
  const emailMap = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const { data: authData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of authData?.users ?? []) {
      if (u.email) emailMap.set(u.id, u.email);
    }
  } catch {
    // best-effort
  }

  // 4) Fallback (PM 2026-06-11): facturas legacy/manuales pueden tener
  //    `user_id` NULL pero el admin tipeó el `customer_email` correcto.
  //    Las atribuimos al perfil que tenga ese email. Sin esto la columna
  //    "Invertido" se quedaba en $0 aunque la factura estaba pagada.
  type OrphanInvoice = { id: string; total_cents: number; customer_email: string | null };
  const { data: orphanInvs } = await supabase
    .from("invoices")
    .select("id, total_cents, customer_email")
    .eq("status", "paid")
    .is("user_id", null);
  const orphanByEmail = new Map<string, { totalCents: number; count: number }>();
  for (const o of (orphanInvs ?? []) as OrphanInvoice[]) {
    const k = (o.customer_email || "").toLowerCase().trim();
    if (!k) continue;
    const prev = orphanByEmail.get(k) ?? { totalCents: 0, count: 0 };
    prev.totalCents += Number(o.total_cents ?? 0);
    prev.count += 1;
    orphanByEmail.set(k, prev);
  }

  const items: CustomerRow[] = profiles.map((p) => {
    const s = statsMap.get(p.id);
    const email = emailMap.get(p.id) ?? null;
    const orphan = email ? orphanByEmail.get(email.toLowerCase().trim()) : undefined;
    return {
      id: p.id,
      email,
      firstName: p.first_name,
      lastName: p.last_name,
      phone: p.phone,
      country: p.country,
      birthDate: p.birth_date,
      role: p.role,
      status: p.status,
      joinedAt: p.created_at ?? "",
      totalInvestedCents: (s?.total_invested_cents ?? 0) + (orphan?.totalCents ?? 0),
      invoicesPaid: (s?.invoices_paid ?? 0) + (orphan?.count ?? 0),
      serviceCount: s?.service_count ?? 0,
      mostFrequentServiceType: s?.most_frequent_service_type ?? null,
    };
  });

  // 5) Clientes "fantasma" (PM 2026-06-12): cualquier factura cuyo
  //    `customer_email` no coincida con ningún perfil registrado se trata
  //    como cliente sin cuenta. NO se filtra por user_id IS NULL — incluso
  //    si la factura está atada a otro perfil pero el admin tipeó otro
  //    email, ese email merece su fila propia en la lista.
  const profileEmails = new Set(items.map((c) => (c.email || "").toLowerCase().trim()).filter(Boolean));
  type GhostInvoice = {
    id: string;
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    total_cents: number;
    status: string;
    created_at: string | null;
    items: Array<{ tour_id: string | null; stay_id: string | null; transfer_route_id: string | null }> | null;
  };
  const { data: ghostInvs } = await supabase
    .from("invoices")
    .select("id, customer_name, customer_email, customer_phone, total_cents, status, created_at, items:invoice_items(tour_id, stay_id, transfer_route_id)");
  const ghostsByEmail = new Map<string, {
    customer_name: string;
    phone: string | null;
    totalPaid: number;
    invoicesPaid: number;
    serviceCount: number;
    firstSeen: string;
    typeCounts: Record<string, number>;
  }>();
  for (const inv of (ghostInvs ?? []) as GhostInvoice[]) {
    const email = (inv.customer_email || "").toLowerCase().trim();
    if (!email || profileEmails.has(email)) continue;
    const prev = ghostsByEmail.get(email) ?? {
      // PM 2026-06-12: NO usar email como fallback del nombre. Confundía al
      // admin (la fila aparecía con el correo en la columna "Cliente").
      // Si la factura no tenía customer_name, dejamos vacío y el render
      // muestra "—" / "(Sin nombre)" claramente.
      customer_name: inv.customer_name || "",
      phone: inv.customer_phone,
      totalPaid: 0,
      invoicesPaid: 0,
      serviceCount: 0,
      firstSeen: inv.created_at ?? "",
      typeCounts: {} as Record<string, number>,
    };
    if (inv.status === "paid") {
      prev.totalPaid += Number(inv.total_cents ?? 0);
      prev.invoicesPaid += 1;
    }
    // Contar servicios por tipo desde invoice_items para resolver
    // mostFrequentServiceType del ghost. Si el item no tiene FK a catálogo
    // (línea custom), se cuenta como "other".
    for (const it of inv.items ?? []) {
      let kind = "other";
      if (it.tour_id) kind = "tour";
      else if (it.stay_id) kind = "stay";
      else if (it.transfer_route_id) kind = "transfer";
      prev.typeCounts[kind] = (prev.typeCounts[kind] ?? 0) + 1;
      prev.serviceCount += 1;
    }
    // Si la factura no tenía items resueltos por la query, contamos
    // 1 servicio "other" para no quedar en 0.
    if (!inv.items || inv.items.length === 0) {
      prev.typeCounts["other"] = (prev.typeCounts["other"] ?? 0) + 1;
      prev.serviceCount += 1;
    }
    // Conservamos el firstSeen más antiguo.
    if ((inv.created_at ?? "") && (!prev.firstSeen || (inv.created_at ?? "") < prev.firstSeen)) {
      prev.firstSeen = inv.created_at ?? "";
    }
    if (!prev.phone && inv.customer_phone) prev.phone = inv.customer_phone;
    ghostsByEmail.set(email, prev);
  }
  for (const [email, g] of ghostsByEmail) {
    // Si el nombre quedó vacío (factura sin customer_name), enviamos
    // firstName/lastName null y el cliente UI ya muestra "(Sin nombre)"
    // como fallback amigable.
    const parts = g.customer_name ? g.customer_name.split(/\s+/) : [];
    const firstName = parts[0] || "";
    const rest = parts.slice(1);
    // mostFrequentServiceType: la categoría con más conteo. Tie-break
    // determinístico por orden alfabético del key.
    const entries = Object.entries(g.typeCounts).sort((a, b) =>
      b[1] - a[1] || a[0].localeCompare(b[0])
    );
    const mostFrequent = entries.length > 0 ? entries[0][0] : null;
    items.push({
      id: "ghost-" + email,
      email,
      firstName: firstName || null,
      lastName: rest.length ? rest.join(" ") : null,
      phone: g.phone,
      country: null,
      birthDate: null,
      role: "ghost",
      status: "unregistered",
      joinedAt: g.firstSeen,
      totalInvestedCents: g.totalPaid,
      invoicesPaid: g.invoicesPaid,
      serviceCount: g.serviceCount,
      mostFrequentServiceType: mostFrequent,
    });
  }

  return { ok: true, data: { items } };
}

export type CustomerDetail = CustomerRow & {
  recentInvoices: Array<{
    id: string;
    number: string;
    status: string;
    totalCents: number;
    createdAt: string;
  }>;
  recentBookings: Array<{
    id: string;
    itemType: string;
    status: string;
    totalCents: number;
    createdAt: string;
  }>;
};

export async function getCustomerDetail(
  userId: string
): Promise<ActionResult<CustomerDetail>> {
  const guard = await getStaffWithPermissionOrError("users:read");
  if (!guard.ok) return guard;

  if (!userId || typeof userId !== "string") {
    return { ok: false, error: "userId requerido" };
  }

  const supabase = await createClient();

  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (profErr || !prof) {
    return { ok: false, error: "Cliente no encontrado" };
  }

  const { data: stats } = await supabase
    .from("customer_stats")
    .select("*")
    .eq("user_id", userId)
    .single();

  let email: string | null = null;
  try {
    const admin = createAdminClient();
    const { data: authData } = await admin.auth.admin.getUserById(userId);
    email = authData?.user?.email ?? null;
  } catch { /* best-effort */ }

  // Buscar facturas: por user_id Y por customer_email (fallback para
  // legacy / facturas manuales). Dedupea por id.
  const { data: invsByUser } = await supabase
    .from("invoices")
    .select("id, number, status, total_cents, created_at, customer_email, user_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  let invsByEmail: typeof invsByUser = null;
  if (email) {
    const { data } = await supabase
      .from("invoices")
      .select("id, number, status, total_cents, created_at, customer_email, user_id")
      .ilike("customer_email", email)
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(20);
    invsByEmail = data;
  }
  const allInvs = [...(invsByUser ?? []), ...(invsByEmail ?? [])];
  const seen = new Set<string>();
  const invs = allInvs.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

  const { data: bks } = await supabase
    .from("bookings")
    .select("id, item_type, status, total_cents, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Recalcular stats con el fallback de email aplicado.
  let totalInvested = Number(stats?.total_invested_cents ?? 0);
  let invoicesPaidCount = Number(stats?.invoices_paid ?? 0);
  for (const i of invsByEmail ?? []) {
    if (i.status === "paid") {
      totalInvested += Number(i.total_cents ?? 0);
      invoicesPaidCount += 1;
    }
  }

  const detail: CustomerDetail = {
    id: prof.id,
    email,
    firstName: prof.first_name,
    lastName: prof.last_name,
    phone: prof.phone,
    country: prof.country,
    birthDate: prof.birth_date,
    role: prof.role,
    status: prof.status,
    joinedAt: prof.created_at ?? "",
    totalInvestedCents: totalInvested,
    invoicesPaid: invoicesPaidCount,
    serviceCount: Number(stats?.service_count ?? 0),
    mostFrequentServiceType: stats?.most_frequent_service_type ?? null,
    recentInvoices: invs.slice(0, 10).map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      totalCents: i.total_cents,
      createdAt: i.created_at ?? "",
    })),
    recentBookings: (bks ?? []).map((b) => ({
      id: b.id,
      itemType: b.item_type,
      status: b.status,
      totalCents: b.total_cents,
      createdAt: b.created_at ?? "",
    })),
  };

  return { ok: true, data: detail };
}
