"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAdminOrError,
  writeAuditLog,
} from "./_shared";
import type { ActionResult } from "./types";
import type { Tables } from "@/lib/supabase/database.types";
import { z } from "zod";
import { isPermissionKey } from "@/lib/permissions/constants";

export type CustomRoleRow = Tables<"custom_roles"> & {
  permissions: string[];
  user_count: number;
};

// ===========================================================================
// SCHEMAS
// ===========================================================================

const nameSchema = z
  .string()
  .trim()
  .min(2, "Nombre muy corto")
  .max(64, "Nombre muy largo")
  .regex(/^[a-z][a-z0-9_-]*$/, "Solo minúsculas, números, _ y - (debe empezar con letra)");

const createRoleSchema = z.object({
  name: nameSchema,
  label_es: z.string().trim().min(1, "Etiqueta ES requerida").max(120),
  label_en: z.string().trim().min(1, "Etiqueta EN requerida").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  active: z.boolean().optional().default(true),
  permissions: z.array(z.string()).default([]),
});

const updateRoleSchema = createRoleSchema.extend({
  id: z.string().uuid("ID inválido"),
});

const deleteRoleSchema = z.object({
  id: z.string().uuid("ID inválido"),
});

const assignRoleSchema = z.object({
  user_id: z.string().uuid("user_id inválido"),
  role_id: z.string().uuid("role_id inválido").nullable(),
});

function firstZodError(err: { errors: { message: string }[] }): string {
  return err.errors[0]?.message ?? "Datos inválidos";
}

// ===========================================================================
// QUERIES
// ===========================================================================

/**
 * Lista roles custom (no borrados) con sus permission keys + cuántos users
 * los tienen asignados. Devuelve [] sin error si el caller no es admin.
 */
export async function listCustomRoles(): Promise<CustomRoleRow[]> {
  const guard = await getAdminOrError();
  if (!guard.ok) return [];

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: roles, error } = await (supabase as any)
    .from("custom_roles")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error || !roles) {
    console.error("[listCustomRoles]", error?.message);
    return [];
  }

  // Permisos por rol (batch)
  const ids = roles.map((r: { id: string }) => r.id);
  if (ids.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: perms } = await (supabase as any)
    .from("custom_role_permissions")
    .select("role_id, permission_key")
    .in("role_id", ids);

  // Usuarios por rol (batch via count agregado)
  const { data: profiles } = await supabase
    .from("profiles")
    .select("custom_role_id")
    .in("custom_role_id", ids);

  const permsByRole = new Map<string, string[]>();
  for (const p of (perms ?? []) as { role_id: string; permission_key: string }[]) {
    const arr = permsByRole.get(p.role_id) ?? [];
    arr.push(p.permission_key);
    permsByRole.set(p.role_id, arr);
  }

  const countByRole = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (!p.custom_role_id) continue;
    countByRole.set(p.custom_role_id, (countByRole.get(p.custom_role_id) ?? 0) + 1);
  }

  return roles.map((r: Tables<"custom_roles">) => ({
    ...r,
    permissions: permsByRole.get(r.id) ?? [],
    user_count: countByRole.get(r.id) ?? 0,
  }));
}

// ===========================================================================
// MUTATIONS
// ===========================================================================

/**
 * Crea un rol custom con su lista inicial de permisos. Admin-only.
 * Idempotente sobre `name` (unique index): si existe, devuelve error legible.
 */
export async function createCustomRole(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;
  const actorId = guard.current.user.id;

  const permsRaw = String(formData.get("permissions") ?? "[]");
  let perms: unknown = [];
  try {
    perms = JSON.parse(permsRaw);
  } catch {
    return { ok: false, error: "Formato de permisos inválido" };
  }

  const parsed = createRoleSchema.safeParse({
    name: formData.get("name") ?? "",
    label_es: formData.get("label_es") ?? "",
    label_en: formData.get("label_en") ?? "",
    description: formData.get("description") ?? "",
    active: formData.get("active") !== "false",
    permissions: perms,
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }
  const d = parsed.data;

  // Filtrar a permission keys conocidas (defense: no se confía en el cliente).
  const validPerms = d.permissions.filter((k) => isPermissionKey(k));

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await (supabase as any)
    .from("custom_roles")
    .insert({
      name: d.name,
      label_es: d.label_es,
      label_en: d.label_en,
      description: d.description || null,
      active: d.active ?? true,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe un rol con ese nombre." };
    }
    return { ok: false, error: `No se pudo crear el rol: ${error.message}` };
  }

  if (validPerms.length > 0) {
    const rows = validPerms.map((k) => ({ role_id: row.id, permission_key: k }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: pErr } = await (supabase as any)
      .from("custom_role_permissions")
      .insert(rows);
    if (pErr) {
      console.warn("[createCustomRole] perms insert:", pErr.message);
    }
  }

  await writeAuditLog(actorId, "custom_role.create", "custom_role", row.id, {
    name: d.name,
    perms: validPerms.length,
  });

  return { ok: true, data: { id: row.id } };
}

/**
 * Update completo: labels, descripción, active, y reemplaza la lista de
 * permisos (DELETE + INSERT en una sola operación lógica).
 */
export async function updateCustomRole(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;
  const actorId = guard.current.user.id;

  const permsRaw = String(formData.get("permissions") ?? "[]");
  let perms: unknown = [];
  try {
    perms = JSON.parse(permsRaw);
  } catch {
    return { ok: false, error: "Formato de permisos inválido" };
  }

  const parsed = updateRoleSchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name") ?? "",
    label_es: formData.get("label_es") ?? "",
    label_en: formData.get("label_en") ?? "",
    description: formData.get("description") ?? "",
    active: formData.get("active") !== "false",
    permissions: perms,
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }
  const { id, ...d } = parsed.data;
  const validPerms = d.permissions.filter((k) => isPermissionKey(k));

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await (supabase as any)
    .from("custom_roles")
    .update({
      name: d.name,
      label_es: d.label_es,
      label_en: d.label_en,
      description: d.description || null,
      active: d.active ?? true,
    })
    .eq("id", id);

  if (upErr) {
    if (upErr.code === "23505") {
      return { ok: false, error: "Ya existe otro rol con ese nombre." };
    }
    return { ok: false, error: `No se pudo actualizar el rol: ${upErr.message}` };
  }

  // Reemplazar permisos: borrar todos los actuales y reinsertar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("custom_role_permissions")
    .delete()
    .eq("role_id", id);

  if (validPerms.length > 0) {
    const rows = validPerms.map((k) => ({ role_id: id, permission_key: k }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("custom_role_permissions").insert(rows);
  }

  await writeAuditLog(actorId, "custom_role.update", "custom_role", id, {
    name: d.name,
    perms: validPerms.length,
  });

  return { ok: true };
}

/**
 * Soft delete (deleted_at = now). Los profiles con custom_role_id apuntando
 * a este rol pierden la referencia (FK ON DELETE SET NULL), pero acá hacemos
 * soft delete, así que la FK sigue válida hasta que un admin haga hard delete.
 * Para el flujo normal, soft delete es lo correcto.
 */
export async function deleteCustomRole(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;
  const actorId = guard.current.user.id;

  const parsed = deleteRoleSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }
  const { id } = parsed.data;

  // Usamos admin client porque vamos a también desasignar el rol de los users
  // (UPDATE profiles SET custom_role_id = null), que requiere staff/admin sobre
  // profiles. fn_is_admin() ya garantiza autorización en este punto.
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: clearErr } = await (admin as any)
    .from("profiles")
    .update({ custom_role_id: null })
    .eq("custom_role_id", id);
  if (clearErr) {
    return { ok: false, error: `No se pudo desasignar el rol de los usuarios: ${clearErr.message}` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("custom_roles")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", id);

  if (error) {
    return { ok: false, error: `No se pudo eliminar el rol: ${error.message}` };
  }

  await writeAuditLog(actorId, "custom_role.delete", "custom_role", id, null);
  return { ok: true };
}

/**
 * Asigna (o desasigna, role_id=null) un rol custom a un profile. Admin-only.
 */
export async function assignCustomRoleToUser(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;
  const actorId = guard.current.user.id;

  const roleRaw = formData.get("role_id");
  const parsed = assignRoleSchema.safeParse({
    user_id: formData.get("user_id") ?? "",
    role_id: roleRaw === "" || roleRaw == null ? null : roleRaw,
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }
  const { user_id, role_id } = parsed.data;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("profiles")
    .update({ custom_role_id: role_id })
    .eq("id", user_id);

  if (error) {
    return { ok: false, error: `No se pudo asignar el rol: ${error.message}` };
  }

  await writeAuditLog(actorId, "custom_role.assign", "profile", user_id, {
    role_id,
  });
  return { ok: true };
}
