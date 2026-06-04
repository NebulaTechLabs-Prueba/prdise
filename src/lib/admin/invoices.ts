"use server";

import { createClient } from "@/lib/supabase/server";
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
// MARK INVOICE PAID
// ===========================================================================
// Pivote 2026-06-04: se eliminó `createInvoiceFromBookings` (atado al
// cart-checkout obsoleto). Fase 2 reescribirá la creación de invoices con
// Stripe Payment Link generado server-side. `markInvoicePaid` y
// `markInvoicesPaidForBooking` se mantienen para soporte manual del admin.

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
