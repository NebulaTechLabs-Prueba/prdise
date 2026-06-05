import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/permissions/queries";
import type { PermissionKey } from "@/lib/permissions/constants";
import type { CurrentUser } from "@/lib/auth/helpers";
import type { Database } from "@/lib/supabase/database.types";

export type { ActionResult } from "./types";
export type UserRole = Database["public"]["Enums"]["user_role"];

const STAFF_ROLES: UserRole[] = ["admin", "employee"];

/**
 * Obtiene el current user + profile sin redirigir.
 * Útil cuando queremos devolver `ActionResult` en lugar de redirigir.
 */
export async function getStaffOrError(): Promise<
  { ok: true; current: CurrentUser } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, error: "Debes iniciar sesión." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, error: "No se pudo verificar tu perfil." };
  }

  if (!STAFF_ROLES.includes(profile.role as UserRole)) {
    return { ok: false, error: "No tienes acceso al panel administrativo." };
  }

  return {
    ok: true,
    current: {
      user: { id: user.id, email: user.email ?? null },
      profile,
    },
  };
}

/**
 * Garantiza que el caller sea admin estricto. Devuelve error en lugar de
 * redirigir, para Server Actions que reportan resultado al cliente.
 */
export async function getAdminOrError(): Promise<
  { ok: true; current: CurrentUser } | { ok: false; error: string }
> {
  const res = await getStaffOrError();
  if (!res.ok) return res;
  if (res.current.profile.role !== "admin") {
    return { ok: false, error: "Solo los administradores pueden realizar esta acción." };
  }
  return res;
}

/**
 * Garantiza que el caller sea staff Y tenga el permiso indicado
 * (o sea admin, que tiene todo por default).
 */
export async function getStaffWithPermissionOrError(
  permissionKey: PermissionKey
): Promise<{ ok: true; current: CurrentUser } | { ok: false; error: string }> {
  const res = await getStaffOrError();
  if (!res.ok) return res;
  if (res.current.profile.role === "admin") return res;

  const supabase = await createClient();
  try {
    const allowed = await hasPermission(supabase, res.current.user.id, permissionKey);
    if (!allowed) {
      return { ok: false, error: "No tienes permiso para realizar esta acción." };
    }
  } catch {
    return { ok: false, error: "No se pudo verificar el permiso." };
  }

  return res;
}

/**
 * Helpers de lectura tipados sobre FormData.
 */
export function readString(fd: FormData, field: string): string | null {
  const v = fd.get(field);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function readStringArray(fd: FormData, field: string): string[] {
  return fd
    .getAll(field)
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function firstZodError(error: {
  errors: { message: string }[];
}): string {
  return error.errors[0]?.message ?? "Datos inválidos";
}

/**
 * Inserta una fila en audit_log usando el cliente admin (porque RLS bloquea
 * inserts de no-admin para esa tabla). NUNCA throw: si falla, log a stderr
 * y seguir adelante.
 */
export async function writeAuditLog(
  actorId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  payload: Record<string, unknown> | null
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_log").insert({
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId,
      payload: payload as never,
    });
    if (error) {
      // No falla la acción principal — solo dejamos rastro en stderr.
      console.error("[audit_log] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[audit_log] unexpected:", err);
  }
}

/**
 * Atajo: redirige a "/" si el caller no es staff. Útil para `listAll*`
 * dentro de loaders de Server Components.
 */
export async function requireStaffOrRedirect(): Promise<CurrentUser> {
  const res = await getStaffOrError();
  if (!res.ok) {
    redirect("/");
  }
  return res.current;
}
