"use server";

import { createClient } from "@/lib/supabase/server";
import type { Database, Tables } from "@/lib/supabase/database.types";
import {
  cancelBookingSchema,
  createBookingOfflineSchema,
  type ClaimData,
} from "./schemas";

type ItemType = Database["public"]["Enums"]["item_type"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

// ---------- Helpers ---------------------------------------------------------

function firstZodError(error: { errors: { message: string }[] }): string {
  return error.errors[0]?.message ?? "Datos inválidos";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resuelve un slug (stays/tours) o UUID (transfer_routes) al UUID del catálogo.
 * Verifica que el ítem esté `active = true`.
 */
async function resolveItemId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemType: ItemType,
  itemId: string
): Promise<string | null> {
  const id = itemId.trim();
  if (!id) return null;

  if (itemType === "transfer") {
    if (!UUID_RE.test(id)) return null;
    const { data } = await supabase
      .from("transfer_routes")
      .select("id")
      .eq("id", id)
      .eq("active", true)
      .maybeSingle();
    return data?.id ?? null;
  }

  const isUuid = UUID_RE.test(id);
  if (itemType === "stay") {
    const q = supabase.from("stays").select("id").eq("active", true);
    const { data } = await (isUuid ? q.eq("id", id) : q.eq("slug", id)).maybeSingle();
    return data?.id ?? null;
  }

  // itemType === "tour"
  const q = supabase.from("tours").select("id").eq("active", true);
  const { data } = await (isUuid ? q.eq("id", id) : q.eq("slug", id)).maybeSingle();
  return data?.id ?? null;
}

/**
 * Aplana `claimData` a las columnas concretas de `payments`:
 *   - external_ref ← claimData.externalRef ?? claimData.bankRef ?? claimData.phone
 *   - receipt_url  ← claimData.receiptUrl
 *   - notes        ← claimData.note (con prefijo del método para auditoría)
 */
function flattenClaimData(
  method: PaymentMethod,
  claim: ClaimData | undefined
): {
  external_ref: string | null;
  receipt_url: string | null;
  notes: string | null;
} {
  if (!claim) {
    return { external_ref: null, receipt_url: null, notes: null };
  }

  const externalRef =
    claim.externalRef?.trim() ||
    (method === "bank" ? claim.bankRef?.trim() : claim.phone?.trim()) ||
    null;

  const receiptUrl = claim.receiptUrl?.trim() || null;

  const noteParts: string[] = [];
  if (method === "ath" && claim.phone?.trim()) {
    noteParts.push(`ATH desde ${claim.phone.trim()}`);
  }
  if (method === "bank" && claim.bankRef?.trim()) {
    noteParts.push(`Ref. bancaria ${claim.bankRef.trim()}`);
  }
  if (claim.note?.trim()) noteParts.push(claim.note.trim());

  return {
    external_ref: externalRef,
    receipt_url: receiptUrl,
    notes: noteParts.length > 0 ? noteParts.join(" — ") : null,
  };
}

// ---------- createBookingOffline -------------------------------------------

export async function createBookingOffline(
  formData: FormData
): Promise<ActionResult<{ bookingId: string; paymentId: string }>> {
  // claimData puede venir como JSON string o como objeto serializado en el form.
  const rawClaim = formData.get("claimData");
  let claimDataInput: unknown = undefined;
  if (typeof rawClaim === "string" && rawClaim.trim().length > 0) {
    try {
      claimDataInput = JSON.parse(rawClaim);
    } catch {
      return {
        ok: false,
        error: "Los datos del pago tienen formato inválido",
      };
    }
  }

  const parsed = createBookingOfflineSchema.safeParse({
    itemType: formData.get("itemType"),
    itemId: formData.get("itemId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") ?? "",
    startTime: formData.get("startTime") ?? "",
    pax: formData.get("pax"),
    totalCents: formData.get("totalCents"),
    notes: formData.get("notes") ?? "",
    paymentMethod: formData.get("paymentMethod"),
    claimData: claimDataInput,
  });

  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const {
    itemType,
    itemId,
    startDate,
    endDate,
    startTime,
    pax,
    totalCents,
    notes,
    paymentMethod,
    claimData,
  } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Debes iniciar sesión para reservar" };
  }

  const resolvedId = await resolveItemId(supabase, itemType, itemId);
  if (!resolvedId) {
    return { ok: false, error: "El ítem no existe o no está disponible" };
  }

  // 1) Insert booking en status 'pending_payment'.
  const bookingPayload: Database["public"]["Tables"]["bookings"]["Insert"] = {
    user_id: user.id,
    item_type: itemType,
    pax,
    total_cents: totalCents,
    start_date: startDate,
    end_date: endDate ? endDate : null,
    start_time: startTime ? startTime : null,
    notes: notes ? notes : null,
    status: "pending_payment",
    stay_id: itemType === "stay" ? resolvedId : null,
    tour_id: itemType === "tour" ? resolvedId : null,
    transfer_route_id: itemType === "transfer" ? resolvedId : null,
  };

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert(bookingPayload)
    .select("id")
    .single();

  if (bookingError || !booking) {
    return { ok: false, error: "No se pudo crear la reserva" };
  }

  // 2) Insert payment 'claimed' — el usuario reportó el pago, falta validar
  //    por el admin. RLS de payments permite al dueño insertar vía booking.
  const flat = flattenClaimData(paymentMethod, claimData);
  const nowIso = new Date().toISOString();

  const paymentPayload: Database["public"]["Tables"]["payments"]["Insert"] = {
    booking_id: booking.id,
    method: paymentMethod,
    amount_cents: totalCents,
    status: "claimed",
    claimed_at: nowIso,
    external_ref: flat.external_ref,
    receipt_url: flat.receipt_url,
    notes: flat.notes,
  };

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert(paymentPayload)
    .select("id")
    .single();

  if (paymentError || !payment) {
    // Best-effort rollback: si falla el payment, marcamos el booking como
    // cancelled. No usamos service_role para respetar la cuenta del usuario.
    await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: nowIso })
      .eq("id", booking.id)
      .eq("user_id", user.id);

    return {
      ok: false,
      error: "No se pudo registrar el pago. La reserva fue cancelada",
    };
  }

  return { ok: true, bookingId: booking.id, paymentId: payment.id };
}

// ---------- cancelBooking ---------------------------------------------------

export async function cancelBooking(
  formData: FormData
): Promise<ActionResult> {
  const parsed = cancelBookingSchema.safeParse({
    bookingId: formData.get("bookingId"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Debes iniciar sesión" };
  }

  // Validar que sea del usuario y que el status permita cancelar.
  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id, user_id, status")
    .eq("id", parsed.data.bookingId)
    .maybeSingle();

  if (fetchError || !booking) {
    return { ok: false, error: "La reserva no existe" };
  }

  if (booking.user_id !== user.id) {
    return { ok: false, error: "No tienes permiso para cancelar esta reserva" };
  }

  if (booking.status !== "pending" && booking.status !== "pending_payment") {
    return {
      ok: false,
      error: "Esta reserva ya no se puede cancelar",
    };
  }

  const { error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", booking.id)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: "No se pudo cancelar la reserva" };
  }

  return { ok: true };
}

// ---------- listMyBookings (helper server-side, no Server Action) ----------

export type BookingView = Tables<"bookings"> & {
  payments: Tables<"payments">[];
  stay: Pick<Tables<"stays">, "id" | "slug" | "title_es" | "title_en" | "images"> | null;
  tour: Pick<Tables<"tours">, "id" | "slug" | "title_es" | "title_en" | "images"> | null;
  transfer_route:
    | Pick<Tables<"transfer_routes">, "id" | "from_location" | "to_location">
    | null;
};

/**
 * Lista las reservas del usuario actual con sus pagos asociados y datos
 * mínimos del producto (para pintar en la UI sin queries extra).
 *
 * Retorna `[]` si no hay sesión.
 */
export async function listMyBookings(): Promise<BookingView[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      payments ( * ),
      stay:stays ( id, slug, title_es, title_en, images ),
      tour:tours ( id, slug, title_es, title_en, images ),
      transfer_route:transfer_routes ( id, from_location, to_location )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data as unknown as BookingView[];
}
