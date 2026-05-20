"use server";

/**
 * Server Actions complementarios al perfil del usuario.
 *
 * NOTA: la edición de campos del perfil (nombre, teléfono, país, idioma) ya
 * vive en `src/lib/auth/actions.ts` como `updateProfile`. Acá agregamos las
 * operaciones que tocan la cuenta de auth: cambio de email y de contraseña.
 *
 * Mensajes en español, formato { ok: true } | { ok: false; error }.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

function firstZodError(error: z.ZodError): string {
  return error.errors[0]?.message ?? "Datos inválidos";
}

// ---------- Change Email ---------------------------------------------------

const changeEmailSchema = z.object({
  newEmail: z
    .string({ required_error: "Email requerido" })
    .trim()
    .min(1, "Email requerido")
    .email("Email inválido"),
});

/**
 * Solicita el cambio de email del usuario actual.
 *
 * Supabase manda automáticamente dos correos de confirmación (uno al email
 * viejo y otro al nuevo). El cambio se concreta cuando el usuario hace click
 * en ambos enlaces. Nosotros solo disparamos el flujo.
 */
export async function changeEmailRequest(
  formData: FormData
): Promise<ActionResult> {
  const parsed = changeEmailSchema.safeParse({
    newEmail: formData.get("newEmail"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { newEmail } = parsed.data;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "No hay sesión activa" };
  }

  if (user.email && user.email.toLowerCase() === newEmail.toLowerCase()) {
    return {
      ok: false,
      error: "El nuevo email debe ser distinto al actual",
    };
  }

  // Supabase usará el Site URL configurado en el dashboard para los enlaces
  // de confirmación enviados al email viejo y al nuevo.
  const { error } = await supabase.auth.updateUser({ email: newEmail });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      return { ok: false, error: "Ese email ya está en uso" };
    }
    if (msg.includes("rate") || msg.includes("limit")) {
      return {
        ok: false,
        error: "Demasiados intentos. Esperá unos minutos e intentá de nuevo",
      };
    }
    return {
      ok: false,
      error:
        "No se pudo iniciar el cambio de email. Verificá la dirección e intentá de nuevo",
    };
  }

  return { ok: true };
}

// ---------- Change Password -------------------------------------------------

const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: "Contraseña actual requerida" })
      .min(1, "Contraseña actual requerida"),
    newPassword: z
      .string({ required_error: "Nueva contraseña requerida" })
      .min(8, "La nueva contraseña debe tener al menos 8 caracteres")
      .max(72, "La nueva contraseña no puede exceder 72 caracteres"),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "La nueva contraseña debe ser distinta a la actual",
    path: ["newPassword"],
  });

/**
 * Cambia la contraseña del usuario actual.
 *
 * Flujo:
 * 1. Recupera el email del usuario via getUser().
 * 2. Re-autentica con signInWithPassword(email, currentPassword) para validar
 *    que conoce la contraseña actual. Si falla, devolvemos error específico.
 * 3. updateUser({ password: newPassword }).
 *
 * El paso 2 actualiza la sesión con un nuevo token, pero como ya estamos
 * autenticados queda inocuo. updateUser usa el JWT en cookies del server
 * client, que sigue siendo válido.
 */
export async function changePassword(
  formData: FormData
): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { currentPassword, newPassword } = parsed.data;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { ok: false, error: "No hay sesión activa" };
  }

  // 1) Validar contraseña actual reintentando signInWithPassword.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (reauthError) {
    return { ok: false, error: "Contraseña actual incorrecta" };
  }

  // 2) Actualizar contraseña.
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    const msg = updateError.message.toLowerCase();
    if (msg.includes("same password") || msg.includes("should be different")) {
      return {
        ok: false,
        error: "La nueva contraseña debe ser distinta a la actual",
      };
    }
    if (msg.includes("weak") || msg.includes("password")) {
      return {
        ok: false,
        error: "La nueva contraseña no cumple los requisitos mínimos",
      };
    }
    return { ok: false, error: "No se pudo actualizar la contraseña" };
  }

  return { ok: true };
}
