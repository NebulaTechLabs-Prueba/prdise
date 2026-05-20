"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALL_PERMISSION_KEYS,
  REVOKE_CONFIRMATION_PHRASE,
  isPermissionKey,
  type PermissionKey,
} from "./constants";

export type PermissionActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ─── Helpers internos ──────────────────────────────────────────────────────

async function assertCallerIsAdmin(): Promise<
  { ok: true; adminId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Debes iniciar sesión para realizar esta acción." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, error: "No se pudo verificar tu perfil." };
  }

  if (profile.role !== "admin") {
    return { ok: false, error: "Solo los administradores pueden modificar permisos." };
  }

  return { ok: true, adminId: user.id };
}

function readString(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readPermissionKey(formData: FormData, field: string): PermissionKey | null {
  const raw = readString(formData, field);
  return raw && isPermissionKey(raw) ? raw : null;
}

function readPermissionKeyArray(
  formData: FormData,
  field: string
): PermissionKey[] | null {
  const values = formData.getAll(field);
  const out: PermissionKey[] = [];
  for (const v of values) {
    if (typeof v !== "string") return null;
    if (!isPermissionKey(v)) return null;
    out.push(v);
  }
  // Deduplicar preservando orden.
  return Array.from(new Set(out));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ─── grantPermission ───────────────────────────────────────────────────────

/**
 * Otorga un permiso individual a un usuario (manager o employee).
 * Solo accesible por admin. Idempotente: si ya existe, no falla.
 */
export async function grantPermission(
  formData: FormData
): Promise<PermissionActionResult> {
  const auth = await assertCallerIsAdmin();
  if (!auth.ok) return auth;

  const userId = readString(formData, "userId");
  const permissionKey = readPermissionKey(formData, "permissionKey");

  if (!userId || !isUuid(userId)) {
    return { ok: false, error: "Identificador de usuario inválido." };
  }
  if (!permissionKey) {
    return { ok: false, error: "Permiso inválido o no reconocido." };
  }

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("user_permissions").upsert(
    {
      user_id: userId,
      permission_key: permissionKey,
      granted_by: auth.adminId,
    },
    { onConflict: "user_id,permission_key", ignoreDuplicates: true }
  );

  if (error) {
    return { ok: false, error: `No se pudo otorgar el permiso: ${error.message}` };
  }

  return { ok: true };
}

// ─── revokePermission ──────────────────────────────────────────────────────

/**
 * Revoca un permiso individual. Requiere que el admin escriba textualmente
 * la frase de confirmación `REVOKE_CONFIRMATION_PHRASE` en el campo
 * `confirmation` del FormData.
 */
export async function revokePermission(
  formData: FormData
): Promise<PermissionActionResult> {
  const auth = await assertCallerIsAdmin();
  if (!auth.ok) return auth;

  const userId = readString(formData, "userId");
  const permissionKey = readPermissionKey(formData, "permissionKey");
  const confirmation = readString(formData, "confirmation");

  if (!userId || !isUuid(userId)) {
    return { ok: false, error: "Identificador de usuario inválido." };
  }
  if (!permissionKey) {
    return { ok: false, error: "Permiso inválido o no reconocido." };
  }
  if (confirmation !== REVOKE_CONFIRMATION_PHRASE) {
    return {
      ok: false,
      error: `Debes escribir exactamente "${REVOKE_CONFIRMATION_PHRASE}" para confirmar la revocación.`,
    };
  }

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("user_permissions")
    .delete()
    .eq("user_id", userId)
    .eq("permission_key", permissionKey);

  if (error) {
    return { ok: false, error: `No se pudo revocar el permiso: ${error.message}` };
  }

  return { ok: true };
}

// ─── bulkSetPermissions ────────────────────────────────────────────────────

/**
 * Reemplaza COMPLETAMENTE el set de permisos de un usuario.
 *
 * Implementación: delete + insert dentro de una RPC transaccional sería ideal,
 * pero como no tenemos esa función SQL aún, hacemos delete + insert con el
 * cliente admin (service_role bypassa RLS). Si el insert falla, intentamos
 * revertir borrando lo recién insertado; el delete previo NO se restaura
 * (mismas filas que iban a ser reescritas).
 */
export async function bulkSetPermissions(
  formData: FormData
): Promise<PermissionActionResult> {
  const auth = await assertCallerIsAdmin();
  if (!auth.ok) return auth;

  const userId = readString(formData, "userId");
  const permissionKeys = readPermissionKeyArray(formData, "permissionKeys");

  if (!userId || !isUuid(userId)) {
    return { ok: false, error: "Identificador de usuario inválido." };
  }
  if (permissionKeys === null) {
    return {
      ok: false,
      error: "La lista de permisos contiene valores no reconocidos.",
    };
  }

  // Validación extra: que las keys sean parte del catálogo conocido.
  const allowed = new Set<string>(ALL_PERMISSION_KEYS);
  for (const k of permissionKeys) {
    if (!allowed.has(k)) {
      return { ok: false, error: `Permiso desconocido: ${k}.` };
    }
  }

  const admin = createAdminClient();

  // 1) Borrar todas las asignaciones actuales del usuario.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: deleteError } = await (admin as any)
    .from("user_permissions")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    return {
      ok: false,
      error: `No se pudieron limpiar los permisos previos: ${deleteError.message}`,
    };
  }

  // 2) Insertar el nuevo set (si lo hay).
  if (permissionKeys.length === 0) {
    return { ok: true };
  }

  const rows = permissionKeys.map((permission_key) => ({
    user_id: userId,
    permission_key,
    granted_by: auth.adminId,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (admin as any).from("user_permissions").insert(rows);

  if (insertError) {
    return {
      ok: false,
      error: `No se pudieron asignar los nuevos permisos: ${insertError.message}`,
    };
  }

  return { ok: true };
}
