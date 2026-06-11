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

  const items: CustomerRow[] = profiles.map((p) => {
    const s = statsMap.get(p.id);
    return {
      id: p.id,
      email: emailMap.get(p.id) ?? null,
      firstName: p.first_name,
      lastName: p.last_name,
      phone: p.phone,
      country: p.country,
      birthDate: p.birth_date,
      role: p.role,
      status: p.status,
      joinedAt: p.created_at ?? "",
      totalInvestedCents: s?.total_invested_cents ?? 0,
      invoicesPaid: s?.invoices_paid ?? 0,
      serviceCount: s?.service_count ?? 0,
      mostFrequentServiceType: s?.most_frequent_service_type ?? null,
    };
  });

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

  const { data: invs } = await supabase
    .from("invoices")
    .select("id, number, status, total_cents, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: bks } = await supabase
    .from("bookings")
    .select("id, item_type, status, total_cents, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  let email: string | null = null;
  try {
    const admin = createAdminClient();
    const { data: authData } = await admin.auth.admin.getUserById(userId);
    email = authData?.user?.email ?? null;
  } catch { /* best-effort */ }

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
    totalInvestedCents: Number(stats?.total_invested_cents ?? 0),
    invoicesPaid: Number(stats?.invoices_paid ?? 0),
    serviceCount: Number(stats?.service_count ?? 0),
    mostFrequentServiceType: stats?.most_frequent_service_type ?? null,
    recentInvoices: (invs ?? []).map((i) => ({
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
