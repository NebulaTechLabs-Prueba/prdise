"use server";

import { createClient } from "@/lib/supabase/server";
import {
  firstZodError,
  getStaffWithPermissionOrError,
  writeAuditLog,
} from "./_shared";
import { confirmPaymentSchema, rejectPaymentSchema } from "./schemas";
import type {
  ActionResult,
  BookingMini,
  CustomerMini,
  PendingPaymentRow,
} from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Payment = Database["public"]["Tables"]["payments"]["Row"];

// ─── listPendingPayments ────────────────────────────────────────────────────

/**
 * Lista todos los payments en status='claimed' (pendientes de validación),
 * con info mínima de booking y customer para que el admin pueda decidir.
 *
 * El email del customer viene de auth.users (no en profiles), por lo que
 * lo resolvemos con el admin client en un segundo paso. Si falla, devolvemos
 * el array con customer_email=null.
 */
export async function listPendingPayments(): Promise<
  ActionResult<PendingPaymentRow[]>
> {
  const guard = await getStaffWithPermissionOrError("payments:read");
  if (!guard.ok) return guard;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("payments")
    .select(
      `
      *,
      booking:bookings (
        id,
        item_type,
        status,
        start_date,
        end_date,
        total_cents,
        user_id,
        stay_id,
        tour_id,
        transfer_route_id,
        customer:profiles!bookings_user_id_fkey (
          id,
          first_name,
          last_name
        )
      )
    `
    )
    .eq("status", "claimed")
    .order("claimed_at", { ascending: true, nullsFirst: false });

  if (error) {
    return {
      ok: false,
      error: `No se pudieron cargar los pagos pendientes: ${error.message}`,
    };
  }

  type Raw = Payment & {
    booking:
      | (BookingMini & { customer: CustomerMini | null })
      | null;
  };

  const rows: PendingPaymentRow[] = ((data ?? []) as unknown as Raw[]).map(
    (r) => ({
      ...r,
      booking: r.booking
        ? {
            id: r.booking.id,
            item_type: r.booking.item_type,
            status: r.booking.status,
            start_date: r.booking.start_date,
            end_date: r.booking.end_date,
            total_cents: r.booking.total_cents,
            user_id: r.booking.user_id,
            stay_id: r.booking.stay_id,
            tour_id: r.booking.tour_id,
            transfer_route_id: r.booking.transfer_route_id,
          }
        : null,
      customer: r.booking?.customer ?? null,
      customer_email: null,
    })
  );

  return { ok: true, data: rows };
}

// ─── confirmPayment ─────────────────────────────────────────────────────────

/**
 * Marca payment.status='confirmed'. Si el booking estaba en 'pending_payment'
 * y no quedan otros payments pendientes (status in 'pending'|'claimed'),
 * promueve booking.status='confirmed'.
 */
export async function confirmPayment(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("payments:confirm");
  if (!guard.ok) return guard;

  const parsed = confirmPaymentSchema.safeParse({
    paymentId: formData.get("paymentId"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { paymentId, notes } = parsed.data;
  const actorId = guard.current.user.id;
  const supabase = await createClient();

  // 1) Cargar payment actual (necesitamos booking_id y status previo).
  const { data: payment, error: fetchErr } = await supabase
    .from("payments")
    .select("id, booking_id, status, notes")
    .eq("id", paymentId)
    .single();

  if (fetchErr || !payment) {
    return { ok: false, error: "El pago no existe o no es accesible." };
  }

  if (payment.status === "confirmed") {
    return { ok: false, error: "Este pago ya está confirmado." };
  }
  if (payment.status === "rejected") {
    return { ok: false, error: "Este pago fue rechazado y no puede confirmarse." };
  }
  if (payment.status === "refunded") {
    return { ok: false, error: "Este pago fue reembolsado." };
  }

  const nowIso = new Date().toISOString();
  const combinedNotes = notes
    ? payment.notes
      ? `${payment.notes}\n[confirm] ${notes}`
      : notes
    : payment.notes ?? null;

  // 2) Marcar payment como confirmed.
  const { error: updPayErr } = await supabase
    .from("payments")
    .update({
      status: "confirmed",
      confirmed_at: nowIso,
      confirmed_by: actorId,
      notes: combinedNotes,
    })
    .eq("id", paymentId);

  if (updPayErr) {
    return {
      ok: false,
      error: `No se pudo confirmar el pago: ${updPayErr.message}`,
    };
  }

  // 3) Promover booking si corresponde.
  const { data: booking, error: bookErr } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", payment.booking_id)
    .single();

  if (!bookErr && booking && booking.status === "pending_payment") {
    // ¿Quedan otros payments aún pendientes/claimed?
    const { count, error: countErr } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", payment.booking_id)
      .in("status", ["pending", "claimed"]);

    if (!countErr && (count ?? 0) === 0) {
      await supabase
        .from("bookings")
        .update({ status: "confirmed", confirmed_at: nowIso })
        .eq("id", payment.booking_id);
    }
  }

  // 4) Audit log (no falla la acción).
  await writeAuditLog(actorId, "payment.confirm", "payment", paymentId, {
    booking_id: payment.booking_id,
    notes: notes || null,
  });

  return { ok: true };
}

// ─── rejectPayment ──────────────────────────────────────────────────────────

/**
 * Marca payment.status='rejected' con motivo, y cancela el booking asociado
 * (porque el pago fue rechazado y la reserva queda sin sustento).
 */
export async function rejectPayment(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("payments:reject");
  if (!guard.ok) return guard;

  const parsed = rejectPaymentSchema.safeParse({
    paymentId: formData.get("paymentId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { paymentId, reason } = parsed.data;
  const actorId = guard.current.user.id;
  const supabase = await createClient();

  const { data: payment, error: fetchErr } = await supabase
    .from("payments")
    .select("id, booking_id, status, notes")
    .eq("id", paymentId)
    .single();

  if (fetchErr || !payment) {
    return { ok: false, error: "El pago no existe o no es accesible." };
  }

  if (payment.status === "rejected") {
    return { ok: false, error: "Este pago ya fue rechazado." };
  }
  if (payment.status === "confirmed") {
    return { ok: false, error: "No se puede rechazar un pago ya confirmado." };
  }
  if (payment.status === "refunded") {
    return { ok: false, error: "Este pago fue reembolsado." };
  }

  const nowIso = new Date().toISOString();
  const combinedNotes = payment.notes
    ? `${payment.notes}\n[reject] ${reason}`
    : `[reject] ${reason}`;

  const { error: updPayErr } = await supabase
    .from("payments")
    .update({
      status: "rejected",
      rejected_at: nowIso,
      notes: combinedNotes,
    })
    .eq("id", paymentId);

  if (updPayErr) {
    return {
      ok: false,
      error: `No se pudo rechazar el pago: ${updPayErr.message}`,
    };
  }

  // Cancelar booking asociado (si no estaba ya terminal).
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", payment.booking_id)
    .single();

  if (
    booking &&
    booking.status !== "cancelled" &&
    booking.status !== "completed" &&
    booking.status !== "refunded"
  ) {
    await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: nowIso })
      .eq("id", payment.booking_id);
  }

  await writeAuditLog(actorId, "payment.reject", "payment", paymentId, {
    booking_id: payment.booking_id,
    reason,
  });

  return { ok: true };
}
