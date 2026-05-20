"use server";

import { createClient } from "@/lib/supabase/server";
import {
  firstZodError,
  getStaffWithPermissionOrError,
  writeAuditLog,
} from "./_shared";
import {
  BOOKING_STATUSES,
  type BookingStatus,
  completeBookingSchema,
  listBookingsOptsSchema,
  type ListBookingsOpts,
  updateBookingStatusSchema,
} from "./schemas";
import type {
  ActionResult,
  AdminBookingRow,
  ListBookingsResult,
} from "./types";

// ─── Transiciones permitidas ────────────────────────────────────────────────

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["pending_payment", "cancelled"],
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "refunded"],
  completed: ["refunded"],
  cancelled: [],
  refunded: [],
};

function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── listAllBookings ────────────────────────────────────────────────────────

export async function listAllBookings(
  opts: ListBookingsOpts = {}
): Promise<ActionResult<ListBookingsResult>> {
  const guard = await getStaffWithPermissionOrError("bookings:read");
  if (!guard.ok) return guard;

  const parsed = listBookingsOptsSchema.safeParse(opts);
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const {
    page = 1,
    pageSize = 25,
    status,
    itemType,
    dateFrom,
    dateTo,
  } = parsed.data;

  const supabase = await createClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("bookings")
    .select(
      `
      *,
      customer:profiles!bookings_user_id_fkey (
        id,
        first_name,
        last_name
      ),
      payments (*)
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (itemType) query = query.eq("item_type", itemType);
  if (dateFrom) query = query.gte("start_date", dateFrom);
  if (dateTo) query = query.lte("start_date", dateTo);

  const { data, error, count } = await query;

  if (error) {
    return {
      ok: false,
      error: `No se pudieron cargar las reservas: ${error.message}`,
    };
  }

  return {
    ok: true,
    data: {
      items: (data ?? []) as unknown as AdminBookingRow[],
      page,
      pageSize,
      total: count ?? 0,
    },
  };
}

// ─── updateBookingStatus ────────────────────────────────────────────────────

export async function updateBookingStatus(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("bookings:update");
  if (!guard.ok) return guard;

  const parsed = updateBookingStatusSchema.safeParse({
    bookingId: formData.get("bookingId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { bookingId, nextStatus } = parsed.data;
  const actorId = guard.current.user.id;
  const supabase = await createClient();

  const { data: booking, error: fetchErr } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .single();

  if (fetchErr || !booking) {
    return { ok: false, error: "La reserva no existe o no es accesible." };
  }

  const currentStatus = booking.status as BookingStatus;
  if (!(BOOKING_STATUSES as readonly string[]).includes(currentStatus)) {
    return { ok: false, error: "Estado actual de la reserva inválido." };
  }
  if (!canTransition(currentStatus, nextStatus)) {
    return {
      ok: false,
      error: `Transición inválida: ${currentStatus} → ${nextStatus}.`,
    };
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "confirmed") patch.confirmed_at = nowIso;
  if (nextStatus === "cancelled") patch.cancelled_at = nowIso;
  if (nextStatus === "completed") patch.completed_at = nowIso;

  const { error: updErr } = await supabase
    .from("bookings")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", bookingId);

  if (updErr) {
    return {
      ok: false,
      error: `No se pudo actualizar la reserva: ${updErr.message}`,
    };
  }

  await writeAuditLog(actorId, "booking.update_status", "booking", bookingId, {
    from: currentStatus,
    to: nextStatus,
  });

  return { ok: true };
}

// ─── completeBooking ────────────────────────────────────────────────────────

/**
 * Marca booking.status='completed'. Esto dispara `tg_award_points_on_booking_completed`
 * que suma puntos al profile del usuario.
 *
 * Solo desde 'confirmed' es transición válida.
 */
export async function completeBooking(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("bookings:update");
  if (!guard.ok) return guard;

  const parsed = completeBookingSchema.safeParse({
    bookingId: formData.get("bookingId"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { bookingId } = parsed.data;
  const actorId = guard.current.user.id;
  const supabase = await createClient();

  const { data: booking, error: fetchErr } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .single();

  if (fetchErr || !booking) {
    return { ok: false, error: "La reserva no existe o no es accesible." };
  }

  const currentStatus = booking.status as BookingStatus;
  if (currentStatus === "completed") {
    return { ok: false, error: "La reserva ya está completada." };
  }
  if (!canTransition(currentStatus, "completed")) {
    return {
      ok: false,
      error: `No se puede completar una reserva en estado ${currentStatus}.`,
    };
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("bookings")
    .update({ status: "completed", completed_at: nowIso })
    .eq("id", bookingId);

  if (updErr) {
    return {
      ok: false,
      error: `No se pudo completar la reserva: ${updErr.message}`,
    };
  }

  await writeAuditLog(actorId, "booking.complete", "booking", bookingId, {
    from: currentStatus,
  });

  return { ok: true };
}
