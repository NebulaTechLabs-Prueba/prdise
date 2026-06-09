"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminOrError } from "./_shared";
import type { ActionResult } from "./types";
import { z } from "zod";

// ===========================================================================
// AUTH TOOLS — workarounds para SMTP roto / Brevo en validación
// ===========================================================================
//
// Cuando el SMTP de Supabase no entrega emails (sender no verificado en
// Brevo, account pendiente de validación, etc.), el admin puede:
//   * Generar un link de confirmación de signup y enviarlo manualmente
//     al cliente por WhatsApp/otro canal.
//   * Confirmar manualmente un email (skip de verificación) para usuarios
//     de confianza.
//   * Generar un link de password reset y enviarlo manualmente.
//
// Solo admin. Operaciones de privilegio máximo — registramos audit log
// pero no usamos writeAuditLog porque no queremos depender de la tabla
// audit_logs (que el admin podría haber dropeado). Console.log basta.
// ===========================================================================

const emailSchema = z.string().trim().email("Email inválido").max(200);

/**
 * Genera un link de confirmación de signup SIN enviar email. Útil cuando el
 * SMTP no funciona: el admin copia el link y se lo envía al cliente por
 * WhatsApp. El cliente abre el link y queda confirmado automáticamente.
 *
 * Requiere que el usuario ya esté registrado en auth.users (signUp creó la
 * fila pero el confirmation email nunca llegó).
 */
export async function generateSignupConfirmLink(
  formData: FormData
): Promise<ActionResult<{ url: string; expires: string | null }>> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Email inválido" };
  }
  const email = parsed.data.toLowerCase();

  try {
    const admin = createAdminClient();
    // generateLink no envía email; solo devuelve la URL. type='signup' aplica
    // a usuarios creados pero no confirmados todavía.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      // password obligatorio para signup pero no se usa al confirmar (el user
      // ya lo tiene seteado). Pasamos uno dummy; Supabase lo ignora si el
      // user existe.
      password: "ignored-existing-user-keeps-their-password",
    });
    if (error) {
      return {
        ok: false,
        error: `No se pudo generar el link: ${error.message}`,
      };
    }
    const url = data?.properties?.action_link ?? null;
    if (!url) {
      return { ok: false, error: "Supabase no devolvió un link válido." };
    }
    console.log(
      `[auth_tools] generateSignupConfirmLink: admin=${guard.current.user.id} email=${email}`
    );
    return {
      ok: true,
      data: {
        url,
        expires: data?.properties?.verification_type
          ? String(data.properties.verification_type)
          : null,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Marca el email como confirmado en auth.users sin requerir verificación.
 * Útil para admins/usuarios de confianza cuando el SMTP no funciona y no se
 * quiere copiar/pegar links. Idempotente: si ya está confirmado, no-op.
 */
export async function forceConfirmEmail(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Email inválido" };
  }
  const email = parsed.data.toLowerCase();

  try {
    const admin = createAdminClient();
    // Buscar el user_id por email
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) {
      return { ok: false, error: `No se pudo buscar el usuario: ${listErr.message}` };
    }
    const user = list.users.find((u) => u.email?.toLowerCase() === email);
    if (!user) {
      return { ok: false, error: "No existe ningún usuario con ese email." };
    }
    if (user.email_confirmed_at) {
      return { ok: true }; // ya confirmado, no-op
    }
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    });
    if (updErr) {
      return { ok: false, error: `No se pudo confirmar el email: ${updErr.message}` };
    }
    console.log(
      `[auth_tools] forceConfirmEmail: admin=${guard.current.user.id} email=${email}`
    );
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Genera un link de recovery (reset password) sin enviar email. Admin copia
 * y manda manual.
 */
export async function generateRecoveryLink(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Email inválido" };
  }
  const email = parsed.data.toLowerCase();

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error) {
      return { ok: false, error: `No se pudo generar el link: ${error.message}` };
    }
    const url = data?.properties?.action_link ?? null;
    if (!url) {
      return { ok: false, error: "Supabase no devolvió un link válido." };
    }
    console.log(
      `[auth_tools] generateRecoveryLink: admin=${guard.current.user.id} email=${email}`
    );
    return { ok: true, data: { url } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
