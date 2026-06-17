"use server";

/**
 * Server actions del lado /account (el cliente final).
 *
 * - listMyInvoices: lista las facturas del usuario logueado.
 * - rateInvoice: el cliente da 1-5 estrellas a UNA factura pagada. La misma
 *   nota se replica como `reviews` por cada item del catálogo que la
 *   factura contenga (tour/stay/transfer_route). Una factura solo puede
 *   calificarse una vez (chequeo server-side).
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";

export type MyInvoiceRow = {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  dueAt: string | null;
  rating: number | null;
  ratedAt: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unitCents: number;
    tourId: string | null;
    stayId: string | null;
    transferRouteId: string | null;
  }>;
};

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

export async function listMyInvoices(): Promise<MyInvoiceRow[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*, items:invoice_items(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[listMyInvoices]", error.message);
    return [];
  }
  type InvoiceWithItems = Tables<"invoices"> & {
    items: Tables<"invoice_items">[] | null;
  };
  return (data as InvoiceWithItems[]).map((inv) => ({
    id: inv.id,
    number: inv.number,
    status: inv.status,
    totalCents: inv.total_cents,
    createdAt: inv.created_at ?? "",
    paidAt: inv.paid_at,
    dueAt: inv.due_at,
    rating: inv.rating,
    ratedAt: inv.rated_at,
    items: (inv.items ?? []).map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitCents: it.unit_cents,
      tourId: it.tour_id,
      stayId: it.stay_id,
      transferRouteId: it.transfer_route_id,
    })),
  }));
}

const rateSchema = z.object({
  invoiceId: z.string().uuid("ID inválido"),
  rating: z.coerce.number().int().min(1, "Mínimo 1 estrella").max(5, "Máximo 5 estrellas"),
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function rateInvoice(
  formData: FormData
): Promise<ActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "Debés iniciar sesión para calificar." };

  const parsed = rateSchema.safeParse({
    invoiceId: formData.get("invoiceId") ?? "",
    rating: formData.get("rating") ?? 0,
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }
  const { invoiceId, rating, comment } = parsed.data;

  const supabase = await createClient();

  // Cargar invoice + items + asegurar dueño y status 'paid'.
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id, user_id, status, rating, items:invoice_items(id, tour_id, stay_id, transfer_route_id, description)")
    .eq("id", invoiceId)
    .single();
  if (invErr || !inv) return { ok: false, error: "Factura no encontrada" };
  if (inv.user_id !== userId) return { ok: false, error: "Esta factura no es tuya" };
  if (inv.status !== "paid") {
    return {
      ok: false,
      error: "Solo podés calificar facturas que ya pagaste.",
    };
  }
  if (inv.rating != null) {
    return { ok: false, error: "Esta factura ya tiene calificación." };
  }

  // 1) marcar invoice como calificada (idempotente; si race, el siguiente
  //    chequeo fallará por el constraint above).
  // PM 2026-06-17: usamos admin client porque la RLS de invoices
  // (invoices_update_staff) NO permite al dueño hacer UPDATE de su propia
  // factura. La UPDATE bajo el cliente regular afectaba 0 filas sin
  // levantar error → la calificación se "guardaba" silenciosamente sin
  // persistir. La seguridad de esta operación está garantizada arriba con
  // los chequeos de user_id ownership + status='paid' + rating==null.
  const nowIso = new Date().toISOString();
  const admin = createAdminClient();
  const { data: upData, error: upErr } = await admin
    .from("invoices")
    .update({
      rating,
      rated_at: nowIso,
      // PM 2026-06-17: persistimos el comentario directamente en invoices
      // para que el admin lo vea sin tener que joinear reviews.body.
      rating_comment: (comment || "").trim() || null,
    })
    .eq("id", invoiceId)
    .eq("user_id", userId)
    .is("rating", null)
    .select("id");
  if (upErr) {
    return { ok: false, error: `No se pudo guardar la calificación: ${upErr.message}` };
  }
  if (!upData || upData.length === 0) {
    // Race condition: alguien más ya calificó entre el SELECT y el UPDATE.
    return { ok: false, error: "Esta factura ya tiene calificación." };
  }

  // 2) por cada item con FK al catálogo, insertar review (status published —
  //    auto-aprobada por estar anclada a una compra real). Si el cliente
  //    deja un comentario, lo replicamos por servicio.
  type ItemRow = {
    id: string;
    description: string;
    tour_id: string | null;
    stay_id: string | null;
    transfer_route_id: string | null;
  };
  const items = (inv.items ?? []) as ItemRow[];
  const reviewRows = items
    .map((it) => {
      let itemType: "tour" | "stay" | "transfer" | null = null;
      let itemId: string | null = null;
      if (it.tour_id) { itemType = "tour"; itemId = it.tour_id; }
      else if (it.stay_id) { itemType = "stay"; itemId = it.stay_id; }
      else if (it.transfer_route_id) { itemType = "transfer"; itemId = it.transfer_route_id; }
      if (!itemType || !itemId) return null;
      return {
        user_id: userId,
        item_type: itemType,
        item_id: itemId,
        rating,
        title: null,
        body: comment || null,
        status: "published" as const,
        approved_by: userId, // self-approved: la compra real ya valida.
        approved_at: nowIso,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (reviewRows.length > 0) {
    // PM 2026-06-17: idem rating — usamos admin client porque reviews
    // probablemente tampoco permite insert directo del cliente (RLS).
    const { error: revErr } = await admin.from("reviews").insert(reviewRows);
    if (revErr) {
      // No revertimos la calificación de la factura — la propagación a
      // `reviews` es secundaria y puede reintentarse en background.
      console.warn("[rateInvoice] reviews insert failed:", revErr.message);
    }
  }

  return { ok: true };
}
