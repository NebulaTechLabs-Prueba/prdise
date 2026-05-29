"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStaffWithPermissionOrError,
  writeAuditLog,
} from "./_shared";
import type { ActionResult } from "./types";
import type { Tables } from "@/lib/supabase/database.types";

export type InvoiceRow = Tables<"invoices"> & {
  items?: Tables<"invoice_items">[];
};

// ===========================================================================
// QUERIES
// ===========================================================================

/**
 * Lista facturas. Staff ve todas; el usuario solo las suyas (vía RLS).
 */
export async function listInvoices(): Promise<InvoiceRow[]> {
  const guard = await getStaffWithPermissionOrError("invoices:read");
  if (!guard.ok) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*, items:invoice_items(*)")
    .order("issued_at", { ascending: false });

  if (error) {
    console.error("[listInvoices]", error.message);
    return [];
  }
  return (data ?? []) as InvoiceRow[];
}

// ===========================================================================
// CREATE INVOICE FROM BOOKINGS
// ===========================================================================

/**
 * Genera una factura agrupando uno o más bookings del usuario actual.
 * Usado tras un checkout exitoso (cart con N items → 1 invoice con N items).
 *
 * Estructura: 1 row en `invoices` + 1 row en `invoice_items` por booking.
 * Status inicial 'sent' (esperando que el pago sea confirmado por staff).
 *
 * El número de factura se genera con un contador del año.
 */
export async function createInvoiceFromBookings(
  formData: FormData
): Promise<ActionResult<{ invoiceId: string; number: string }>> {
  const rawBookingIds = String(formData.get("bookingIds") ?? "");
  const bookingIds = rawBookingIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (bookingIds.length === 0) {
    return { ok: false, error: "Sin bookings que facturar" };
  }

  const customerName = String(formData.get("customerName") ?? "").trim();
  const customerEmail = String(formData.get("customerEmail") ?? "").trim();
  const customerPhone = String(formData.get("customerPhone") ?? "").trim();
  if (!customerEmail) {
    return { ok: false, error: "Email del cliente requerido" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesión requerida" };
  }

  // Cargar bookings: validar que sean del user y obtener montos.
  const { data: bookings, error: bkErr } = await supabase
    .from("bookings")
    .select(
      "id, item_type, total_cents, start_date, pax, stay_id, tour_id, transfer_route_id, transfer_route:transfer_routes(from_location, to_location), stay:stays(title_es), tour:tours(title_es)"
    )
    .in("id", bookingIds)
    .eq("user_id", user.id);

  if (bkErr || !bookings || bookings.length === 0) {
    return { ok: false, error: "No se encontraron las reservas" };
  }

  const subtotalCents = bookings.reduce(
    (acc, b) => acc + (b.total_cents ?? 0),
    0
  );
  const totalCents = subtotalCents;

  // Generar número INV-YYYY-### usando count existente del año (admin client
  // para evitar RLS cuando el usuario no tiene staff perms).
  const year = new Date().getFullYear();
  const admin = createAdminClient();
  const { count } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .gte("issued_at", `${year}-01-01`)
    .lte("issued_at", `${year}-12-31`);
  const nextNum = (count ?? 0) + 1;
  const number = `INV-${year}-${String(nextNum).padStart(3, "0")}`;

  // Insert invoice.
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      number,
      user_id: user.id,
      customer_name: customerName || user.email || "Customer",
      customer_email: customerEmail,
      customer_phone: customerPhone || null,
      subtotal_cents: subtotalCents,
      total_cents: totalCents,
      status: "sent",
    })
    .select("id, number")
    .single();

  if (invErr || !invoice) {
    return {
      ok: false,
      error: `No se pudo crear la factura: ${invErr?.message ?? "desconocido"}`,
    };
  }

  // Insert items por booking.
  const items = bookings.map((b) => {
    let desc = "Reserva";
    if (b.item_type === "transfer" && b.transfer_route) {
      desc = `Traslado: ${b.transfer_route.from_location} → ${b.transfer_route.to_location}`;
    } else if (b.item_type === "stay" && b.stay) {
      desc = `Estadía: ${b.stay.title_es}`;
    } else if (b.item_type === "tour" && b.tour) {
      desc = `Tour: ${b.tour.title_es}`;
    }
    if (b.start_date) desc += ` · ${b.start_date}`;
    return {
      invoice_id: invoice.id,
      booking_id: b.id,
      description: desc,
      quantity: b.pax || 1,
      unit_cents: Math.round((b.total_cents ?? 0) / (b.pax || 1)),
      line_total_cents: b.total_cents ?? 0,
    };
  });

  const { error: itErr } = await supabase.from("invoice_items").insert(items);
  if (itErr) {
    // Best-effort cleanup: borramos la invoice si fallaron los items.
    await supabase.from("invoices").delete().eq("id", invoice.id);
    return {
      ok: false,
      error: `No se pudo crear los items de la factura: ${itErr.message}`,
    };
  }

  return { ok: true, data: { invoiceId: invoice.id, number: invoice.number } };
}

// ===========================================================================
// MARK INVOICE PAID
// ===========================================================================

/**
 * Marca una factura como pagada. Solo staff. Usado tras confirmPayment para
 * cerrar el ciclo Service → Payment → Invoice.
 */
export async function markInvoicePaid(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("invoices:write");
  if (!guard.ok) return guard;

  const id = String(formData.get("id") ?? "").trim();
  const paymentRef = String(formData.get("paymentRef") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  const actorId = guard.current.user.id;

  const { error } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      ...(paymentRef ? { payment_ref: paymentRef } : {}),
    })
    .eq("id", id);

  if (error) {
    return { ok: false, error: `No se pudo marcar como pagada: ${error.message}` };
  }

  await writeAuditLog(actorId, "invoice.paid", "invoice", id, { paymentRef });
  return { ok: true };
}

/**
 * Marca como pagadas las facturas que tienen items relacionados al booking_id
 * dado. Usado desde confirmPayment para mantener Service→Payment→Invoice
 * en sincronía: cuando el admin confirma un pago de una reserva, todas las
 * facturas que contengan esa reserva pasan a 'paid' automaticamente.
 */
export async function markInvoicesPaidForBooking(
  formData: FormData
): Promise<ActionResult<{ invoicesUpdated: number }>> {
  const guard = await getStaffWithPermissionOrError("invoices:write");
  if (!guard.ok) return guard;

  const bookingId = String(formData.get("bookingId") ?? "").trim();
  if (!bookingId) return { ok: false, error: "bookingId requerido" };

  const supabase = await createClient();

  // Buscar invoice_ids vinculadas al booking.
  const { data: items, error: itErr } = await supabase
    .from("invoice_items")
    .select("invoice_id")
    .eq("booking_id", bookingId);

  if (itErr) {
    return { ok: false, error: `No se pudieron buscar facturas: ${itErr.message}` };
  }
  const invoiceIds = Array.from(
    new Set((items ?? []).map((i) => i.invoice_id).filter(Boolean))
  );
  if (invoiceIds.length === 0) {
    return { ok: true, data: { invoicesUpdated: 0 } };
  }

  const { error: upErr, count } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() }, { count: "exact" })
    .in("id", invoiceIds)
    .neq("status", "paid");

  if (upErr) {
    return { ok: false, error: `No se pudo actualizar facturas: ${upErr.message}` };
  }

  return { ok: true, data: { invoicesUpdated: count ?? 0 } };
}
