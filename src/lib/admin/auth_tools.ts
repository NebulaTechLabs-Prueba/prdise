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

// PM 2026-06-17: los links generados por generateLink redirigen al "Site URL"
// configurado en el dashboard de Supabase Auth — si quedó como la IP cruda
// de Hetzner (http://46.225.63.21) el browser tira ERR_SSL_PROTOCOL_ERROR
// al abrirlos. Pasamos redirectTo explícito a https://livinginprdise.com/
// auth/callback para sobreescribir el default y garantizar HTTPS.
function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://livinginprdise.com";
}

/**
 * Genera un link de confirmación de signup SIN enviar email. Útil cuando el
 * SMTP no funciona: el admin copia el link y se lo envía al cliente por
 * WhatsApp. El cliente abre el link y queda confirmado automáticamente.
 *
 * Devuelve también `phone` (de profiles.phone) si el cliente lo cargó en el
 * registro, para que el UI pueda pre-llenar el wa.me link automáticamente.
 *
 * Requiere que el usuario ya esté registrado en auth.users (signUp creó la
 * fila pero el confirmation email nunca llegó).
 */
export async function generateSignupConfirmLink(
  formData: FormData
): Promise<ActionResult<{ url: string; expires: string | null; phone: string | null; name: string | null }>> {
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
    // PM 2026-06-17: usábamos type=signup + password dummy con la suposición
    // de que Supabase lo ignoraba si el user existía. ESO NO ES CIERTO en
    // versiones recientes — devuelve "A user with this email address has
    // already been registered". El endpoint correcto para "darle un link a
    // un user EXISTENTE no confirmado" es type=magiclink: tolera users
    // existentes, marca email_confirmed_at automáticamente al usar el link,
    // y además sesiona al usuario en un solo click (mejor UX que signup).
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      // redirectTo al home — supabase-js (browser client) tiene
      // detectSessionInUrl=true por default y procesa el #access_token del
      // hash automáticamente al cargar.
      options: { redirectTo: `${getAppUrl()}/` },
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
    // Buscar phone/nombre del cliente en profiles para pre-llenar wa.me.
    let phone: string | null = null;
    let name: string | null = null;
    try {
      const userId = data?.user?.id;
      if (userId) {
        const { data: profile } = await admin
          .from("profiles")
          .select("phone, first_name, last_name")
          .eq("id", userId)
          .maybeSingle();
        if (profile) {
          phone = (profile.phone || "").trim() || null;
          name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || null;
        }
      }
    } catch {
      /* best-effort, no bloqueante */
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
        phone,
        name,
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
): Promise<ActionResult<{ url: string; phone: string | null; name: string | null }>> {
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
      // PM 2026-06-17: recovery va DIRECTO a /auth/reset-password (esa página
      // parsea el hash con setSession y muestra el form). El callback genérico
      // /auth/callback espera ?code=... (flow PKCE) y rompe en el flow hash de
      // recovery — falla con auth_callback_failed.
      options: { redirectTo: `${getAppUrl()}/auth/reset-password` },
    });
    if (error) {
      return { ok: false, error: `No se pudo generar el link: ${error.message}` };
    }
    const url = data?.properties?.action_link ?? null;
    if (!url) {
      return { ok: false, error: "Supabase no devolvió un link válido." };
    }
    let phone: string | null = null;
    let name: string | null = null;
    try {
      const userId = data?.user?.id;
      if (userId) {
        const { data: profile } = await admin
          .from("profiles")
          .select("phone, first_name, last_name")
          .eq("id", userId)
          .maybeSingle();
        if (profile) {
          phone = (profile.phone || "").trim() || null;
          name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || null;
        }
      }
    } catch {
      /* best-effort */
    }
    console.log(
      `[auth_tools] generateRecoveryLink: admin=${guard.current.user.id} email=${email}`
    );
    return { ok: true, data: { url, phone, name } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
