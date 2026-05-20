"use server";

import { createClient } from "@/lib/supabase/server";
import type { Database, Tables } from "@/lib/supabase/database.types";
import {
  addToCartSchema,
  removeFromCartSchema,
  updateCartItemSchema,
} from "./schemas";

type ItemType = Database["public"]["Enums"]["item_type"];

export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

// ---------- Helpers ---------------------------------------------------------

function firstZodError(error: { errors: { message: string }[] }): string {
  return error.errors[0]?.message ?? "Datos inválidos";
}

/**
 * UUID v1-v5 regex (lo suficientemente estricta para distinguir slug vs UUID).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resuelve `itemId` (slug o UUID) al UUID real del catálogo. Retorna `null`
 * si no existe o está inactivo.
 *
 * - `stay` / `tour` tienen columna `slug`. Acepta tanto slug como UUID.
 * - `transfer` no tiene slug — se asume que `itemId` ya es el UUID.
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

  // Si parece UUID, buscar por id; de lo contrario, por slug.
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

// ---------- addToCart -------------------------------------------------------

export async function addToCart(
  formData: FormData
): Promise<ActionResult<{ cartItemId: string }>> {
  const parsed = addToCartSchema.safeParse({
    itemType: formData.get("itemType"),
    itemId: formData.get("itemId"),
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    pax: formData.get("pax"),
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { itemType, itemId, startDate, endDate, pax, notes } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Debes iniciar sesión para agregar al carrito" };
  }

  const resolvedId = await resolveItemId(supabase, itemType, itemId);
  if (!resolvedId) {
    return { ok: false, error: "El ítem no existe o no está disponible" };
  }

  const insertPayload: Database["public"]["Tables"]["cart_items"]["Insert"] = {
    user_id: user.id,
    item_type: itemType,
    pax,
    start_date: startDate ? startDate : null,
    end_date: endDate ? endDate : null,
    notes: notes ? notes : null,
    stay_id: itemType === "stay" ? resolvedId : null,
    tour_id: itemType === "tour" ? resolvedId : null,
    transfer_route_id: itemType === "transfer" ? resolvedId : null,
  };

  const { data, error } = await supabase
    .from("cart_items")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "No se pudo agregar al carrito" };
  }

  return { ok: true, cartItemId: data.id };
}

// ---------- removeFromCart --------------------------------------------------

export async function removeFromCart(
  formData: FormData
): Promise<ActionResult> {
  const parsed = removeFromCartSchema.safeParse({
    cartItemId: formData.get("cartItemId"),
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

  // Guard explícito sumado a RLS: delete solo si user_id coincide.
  const { error, count } = await supabase
    .from("cart_items")
    .delete({ count: "exact" })
    .eq("id", parsed.data.cartItemId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: "No se pudo eliminar el ítem del carrito" };
  }

  if (count === 0) {
    return { ok: false, error: "El ítem del carrito no existe" };
  }

  return { ok: true };
}

// ---------- updateCartItem --------------------------------------------------

export async function updateCartItem(
  formData: FormData
): Promise<ActionResult> {
  // Campos opcionales: solo se actualiza lo provisto explícitamente.
  const raw = {
    cartItemId: formData.get("cartItemId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    pax: formData.get("pax"),
    notes: formData.get("notes"),
  };

  const parsed = updateCartItemSchema.safeParse({
    cartItemId: raw.cartItemId,
    startDate: raw.startDate ?? "",
    endDate: raw.endDate ?? "",
    pax: raw.pax === null || raw.pax === undefined || raw.pax === "" ? undefined : raw.pax,
    notes: raw.notes ?? "",
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

  const update: Database["public"]["Tables"]["cart_items"]["Update"] = {};

  // Solo agregar campos cuando vinieron en el FormData (raw !== null).
  if (raw.startDate !== null) {
    update.start_date = parsed.data.startDate ? parsed.data.startDate : null;
  }
  if (raw.endDate !== null) {
    update.end_date = parsed.data.endDate ? parsed.data.endDate : null;
  }
  if (parsed.data.pax !== undefined) {
    update.pax = parsed.data.pax;
  }
  if (raw.notes !== null) {
    update.notes = parsed.data.notes ? parsed.data.notes : null;
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "No hay cambios para guardar" };
  }

  const { error, count } = await supabase
    .from("cart_items")
    .update(update, { count: "exact" })
    .eq("id", parsed.data.cartItemId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: "No se pudo actualizar el ítem del carrito" };
  }

  if (count === 0) {
    return { ok: false, error: "El ítem del carrito no existe" };
  }

  return { ok: true };
}

// ---------- listCart (helper server-side, no Server Action) ----------------

export type CartItemView = Tables<"cart_items"> & {
  stay: Pick<Tables<"stays">, "id" | "slug" | "title_es" | "title_en" | "images" | "price_cents"> | null;
  tour: Pick<Tables<"tours">, "id" | "slug" | "title_es" | "title_en" | "images" | "price_cents"> | null;
  transfer_route:
    | Pick<
        Tables<"transfer_routes">,
        "id" | "from_location" | "to_location" | "base_price_cents"
      >
    | null;
};

/**
 * Lista los ítems del carrito del usuario actual con sus relaciones de
 * producto (título bilingüe, imagen, precio). Retorna `[]` si no hay sesión.
 *
 * NO es una Server Action — pensada para invocarse desde Server Components
 * (páginas, layouts) que necesiten pintar el carrito.
 */
export async function listCart(): Promise<CartItemView[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("cart_items")
    .select(
      `
      *,
      stay:stays ( id, slug, title_es, title_en, images, price_cents ),
      tour:tours ( id, slug, title_es, title_en, images, price_cents ),
      transfer_route:transfer_routes ( id, from_location, to_location, base_price_cents )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data as unknown as CartItemView[];
}
