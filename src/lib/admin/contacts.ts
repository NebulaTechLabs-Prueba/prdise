"use server";

import { createClient } from "@/lib/supabase/server";
import { getStaffOrError, writeAuditLog } from "./_shared";
import type { ActionResult } from "./types";
import type { Tables } from "@/lib/supabase/database.types";

export type ContactMessageRow = Tables<"contact_messages">;

// ===========================================================================
// CONTACT MESSAGES (admin)
// ===========================================================================

/**
 * Lista mensajes de contacto recibidos. Staff puede leer todos (RLS).
 * Más recientes primero. Sin paginación inicial — el volumen es bajo.
 */
export async function listContactMessages(): Promise<ContactMessageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listContactMessages]", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Cambiar el status de un mensaje (new → read → replied → spam).
 */
export async function updateContactStatus(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffOrError();
  if (!guard.ok) return guard;

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const allowed = ["new", "read", "replied", "spam"];
  if (!id || !allowed.includes(status)) {
    return { ok: false, error: "Datos inválidos" };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const patch: {
    status: string;
    replied_at?: string;
    replied_by?: string;
  } = { status };
  if (status === "replied") {
    patch.replied_at = new Date().toISOString();
    patch.replied_by = actorId;
  }

  const { error } = await supabase
    .from("contact_messages")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", id);

  if (error) {
    return { ok: false, error: `No se pudo actualizar: ${error.message}` };
  }

  await writeAuditLog(actorId, "contact.status", "contact_message", id, {
    status,
  });
  return { ok: true };
}

/**
 * Crear un contacto manual desde el panel admin (PM 2026-06-11). Útil para
 * registrar leads que llegaron por otros canales (WhatsApp directo, llamada
 * telefónica, evento presencial) sin pasar por el form de contacto público.
 */
export async function createManualContact(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const guard = await getStaffOrError();
  if (!guard.ok) return guard;

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name) return { ok: false, error: "Nombre requerido" };
  if (!email && !phone) {
    return { ok: false, error: "Se requiere al menos email o teléfono" };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email inválido" };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;

  const { data, error } = await supabase
    .from("contact_messages")
    .insert({
      name,
      // contact_messages.email es NOT NULL — si el admin solo capturó tel,
      // usamos un placeholder válido (no funcional) para no romper el
      // constraint. La columna seguirá siendo útil para búsquedas.
      email: email || `no-email+${Date.now()}@prdise.local`,
      phone: phone || null,
      message: message || "Contacto agregado manualmente desde admin.",
      status: "new",
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: `No se pudo crear el contacto: ${error.message}` };
  }

  await writeAuditLog(actorId, "contact.create_manual", "contact_message", data?.id ?? null, {
    email,
  });
  return { ok: true, data: { id: data?.id ?? "" } };
}

/**
 * Eliminar permanentemente un mensaje (no hay soft delete en esta tabla).
 */
export async function deleteContactMessage(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffOrError();
  if (!guard.ok) return guard;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  const actorId = guard.current.user.id;

  const { error } = await supabase
    .from("contact_messages")
    .delete()
    .eq("id", id);

  if (error) {
    return { ok: false, error: `No se pudo eliminar: ${error.message}` };
  }

  await writeAuditLog(actorId, "contact.delete", "contact_message", id, null);
  return { ok: true };
}
