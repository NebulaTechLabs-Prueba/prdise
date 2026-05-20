"use server";

/**
 * Server Action pública del formulario de contacto.
 *
 * Características:
 * - No requiere auth: RLS sobre `contact_messages` permite insert al rol anon.
 * - Best-effort: si el insert falla, igual respondemos `{ ok: true }` para no
 *   exponer detalles del backend ni invitar a abuso. El error se loguea para
 *   monitoreo.
 * - Validación con zod; los errores de validación SÍ se devuelven al usuario
 *   porque son útiles para corregir el formulario.
 */

import { createClient } from "@/lib/supabase/server";
import { contactMessageSchema } from "./schemas";

export type ContactActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitContactMessage(
  formData: FormData
): Promise<ContactActionResult> {
  const parsed = contactMessageSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    message: formData.get("message"),
  });

  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Datos inválidos";
    return { ok: false, error: msg };
  }

  const { name, email, phone, message } = parsed.data;

  try {
    const supabase = await createClient();

    const { error } = await supabase.from("contact_messages").insert({
      name,
      email,
      phone: phone ? phone : null,
      message,
      status: "new",
    });

    if (error) {
      console.error("[contact] insert error:", error.message);
    }
  } catch (err) {
    console.error("[contact] unexpected error:", err);
  }

  // Best-effort: siempre ok para no filtrar info del backend.
  return { ok: true };
}
