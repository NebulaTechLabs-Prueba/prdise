"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  signUpSchema,
  signInSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  softDeleteSchema,
  updateProfileSchema,
} from "./schemas";

// ---------- Tipos de retorno -----------------------------------------------

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type SignInResult =
  | { ok: true; role: "admin" | "user" }
  | { ok: false; error: string }
  | { ok: false; needsReactivation: true; userId: string };

// ---------- Helpers internos ------------------------------------------------

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://46.225.63.21";
}

function firstZodError(error: { errors: { message: string }[] }): string {
  return error.errors[0]?.message ?? "Datos inválidos";
}

// ---------- Sign Up ---------------------------------------------------------

export async function signUp(formData: FormData): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { email, password, firstName, lastName } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // El trigger tg_handle_new_user lee estos campos de raw_user_meta_data
      // para poblar profiles.first_name / last_name.
      data: {
        first_name: firstName,
        last_name: lastName,
      },
      emailRedirectTo: `${getAppUrl()}/auth/callback`,
    },
  });

  if (error) {
    // Mensajes comunes de Supabase mapeados a español
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("already been")) {
      return { ok: false, error: "Ese email ya está registrado" };
    }
    if (msg.includes("password")) {
      return {
        ok: false,
        error: "La contraseña no cumple los requisitos mínimos",
      };
    }
    return { ok: false, error: "No se pudo crear la cuenta. Intenta de nuevo" };
  }

  // Email confirmation está ON: NO auto-login.
  return { ok: true };
}

// ---------- Verify Email OTP -----------------------------------------------

export async function verifyEmailOtp(
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim().replace(/\s/g, "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email inválido" };
  }
  if (!token || !/^\d{6}$/.test(token)) {
    return { ok: false, error: "El código debe tener 6 dígitos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "signup",
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("expired")) {
      return { ok: false, error: "El código expiró. Solicita uno nuevo" };
    }
    if (msg.includes("invalid") || msg.includes("token")) {
      return { ok: false, error: "Código incorrecto. Revisa tu correo" };
    }
    return { ok: false, error: "No se pudo verificar el código" };
  }

  return { ok: true };
}

// ---------- Resend Signup OTP ----------------------------------------------

export async function resendSignupOtp(
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${getAppUrl()}/auth/callback` },
  });

  if (error) {
    return { ok: false, error: "No se pudo reenviar el código" };
  }
  return { ok: true };
}

// ---------- Sign In ---------------------------------------------------------

export async function signIn(formData: FormData): Promise<SignInResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    const msg = (error?.message ?? "").toLowerCase();
    if (msg.includes("invalid login")) {
      return { ok: false, error: "Email o contraseña incorrectos" };
    }
    if (msg.includes("email not confirmed")) {
      return {
        ok: false,
        error: "Debes confirmar tu email antes de iniciar sesión",
      };
    }
    return { ok: false, error: "No se pudo iniciar sesión" };
  }

  // Chequear status + role del profile.
  const { data: profile } = await supabase
    .from("profiles")
    .select("status, role")
    .eq("id", data.user.id)
    .single();

  if (profile?.status === "inactive") {
    // CRÍTICO: cerrar la sesión recién abierta antes de devolver el flag
    // de reactivación; si no, el usuario inactivo queda autenticado.
    const userId = data.user.id;
    await supabase.auth.signOut();
    return { ok: false, needsReactivation: true, userId };
  }

  // NO usamos redirect() del Server Action porque cuando el caller viene
  // de un hash route (/#/login) y el target Next path es el mismo
  // (también "/"), router.replace no navega y la página queda colgada en
  // loading. En su lugar devolvemos el rol y el cliente hace una navegación
  // explícita con window.location.assign al destino correcto.
  return {
    ok: true,
    role: (profile?.role ?? "user") as "admin" | "user",
  };
}

// ---------- Sign Out --------------------------------------------------------

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// ---------- Password Reset (request) ---------------------------------------

export async function requestPasswordReset(
  formData: FormData
): Promise<ActionResult> {
  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { email } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getAppUrl()}/auth/reset-password`,
  });

  if (error) {
    // No revelar si el email existe o no
    return { ok: true };
  }

  return { ok: true };
}

// ---------- Password Reset (confirm) ---------------------------------------

export async function confirmPasswordReset(
  formData: FormData
): Promise<ActionResult> {
  const parsed = passwordResetConfirmSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { newPassword } = parsed.data;
  const supabase = await createClient();

  // Validar que haya sesión activa antes de intentar el update (sin esto
  // el error de Supabase es "Auth session missing" que confunde al usuario).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error:
        "El enlace expiró o ya fue usado. Solicita un nuevo enlace de restablecimiento.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("same password") || msg.includes("should be different")) {
      return {
        ok: false,
        error: "La nueva contraseña debe ser distinta a la anterior",
      };
    }
    if (msg.includes("weak") || msg.includes("password")) {
      return {
        ok: false,
        error: `Contraseña rechazada: ${error.message}`,
      };
    }
    return {
      ok: false,
      error: `No se pudo actualizar la contraseña: ${error.message}`,
    };
  }

  return { ok: true };
}

// ---------- Reactivate Account ---------------------------------------------

export async function reactivateAccount(): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "No hay sesión activa" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, error: "No se encontró el perfil" };
  }

  if (profile.status !== "inactive") {
    return {
      ok: false,
      error: "La cuenta no está inactiva",
    };
  }

  // El trigger tg_profiles_guard_update bloquea cambios de status para
  // no-admins, por eso usamos admin client (service_role).
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("profiles")
    .update({ status: "active", deleted_at: null })
    .eq("id", user.id);

  if (updateError) {
    return { ok: false, error: "No se pudo reactivar la cuenta" };
  }

  return { ok: true };
}

// ---------- Soft Delete Account --------------------------------------------

export async function softDeleteAccount(formData: FormData): Promise<void> {
  const parsed = softDeleteSchema.safeParse({
    confirmation: formData.get("confirmation"),
  });

  if (!parsed.success) {
    throw new Error(firstZodError(parsed.error));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();

  const { error: updateError } = await admin
    .from("profiles")
    .update({ status: "inactive", deleted_at: new Date().toISOString() })
    .eq("id", user.id);

  if (updateError) {
    throw new Error("No se pudo desactivar la cuenta");
  }

  // Cerrar todas las sesiones del usuario (global)
  await admin.auth.admin.signOut(user.id, "global");

  redirect("/");
}

// ---------- Update Profile --------------------------------------------------

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    phone: formData.get("phone") ?? "",
    country: formData.get("country") ?? "",
    langPref: formData.get("langPref"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "No hay sesión activa" };
  }

  const { firstName, lastName, phone, country, langPref } = parsed.data;

  // El trigger tg_profiles_guard_update bloquea cambios a role/status/etc
  // para no-admins, así que el cliente server normal es seguro acá.
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName ? firstName : null,
      last_name: lastName ? lastName : null,
      phone: phone ? phone : null,
      country: country ? country : null,
      lang_pref: langPref,
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: "No se pudo actualizar el perfil" };
  }

  return { ok: true };
}
