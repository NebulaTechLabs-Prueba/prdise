"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  firstZodError,
  getAdminOrError,
  getStaffWithPermissionOrError,
  writeAuditLog,
} from "./_shared";
import {
  listUsersOptsSchema,
  type ListUsersOpts,
  toggleUserStatusSchema,
  updateUserRoleSchema,
} from "./schemas";
import type { ActionResult, AdminUserRow, ListUsersResult } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

// ─── listAllUsers ───────────────────────────────────────────────────────────

/**
 * Lista profiles con paginación y filtros por role/status/search.
 * El email vive en auth.users, así que lo cruzamos en un segundo paso usando
 * el admin client. Si la llamada admin falla, devolvemos email=null.
 */
export async function listAllUsers(
  opts: ListUsersOpts = {}
): Promise<ActionResult<ListUsersResult>> {
  const guard = await getStaffWithPermissionOrError("users:read");
  if (!guard.ok) return guard;

  const parsed = listUsersOptsSchema.safeParse(opts);
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { page = 1, pageSize = 25, role, status, search } = parsed.data;

  const supabase = await createClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (role) query = query.eq("role", role);
  if (status) query = query.eq("status", status);
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern}`
    );
  }

  const { data, error, count } = await query;
  if (error) {
    return { ok: false, error: `No se pudieron cargar los usuarios: ${error.message}` };
  }

  const profiles = (data ?? []) as Profile[];

  // Resolver emails desde auth.users (solo posible con service_role).
  const emails = new Map<string, string | null>();
  try {
    const admin = createAdminClient();
    // listUsers tiene paginación, pero para MVP traemos la primera página
    // grande y cruzamos. En producción real, hacer fetch individual por id
    // o cachear. Aquí solo intentamos best-effort.
    const { data: authData, error: authErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (!authErr) {
      for (const u of authData.users) {
        emails.set(u.id, u.email ?? null);
      }
    }
  } catch {
    // best-effort; quedan en null.
  }

  const items: AdminUserRow[] = profiles.map((p) => ({
    ...p,
    email: emails.get(p.id) ?? null,
  }));

  return {
    ok: true,
    data: { items, page, pageSize, total: count ?? 0 },
  };
}

// ─── updateUserRole ─────────────────────────────────────────────────────────

/**
 * Cambia el role de un usuario. SOLO admin estricto.
 * Usa admin client (service_role) porque `tg_profiles_guard_update` bloquea
 * cambios de role hechos por no-admins.
 */
export async function updateUserRole(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;

  const parsed = updateUserRoleSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    newRole: formData.get("newRole"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { targetUserId, newRole } = parsed.data;
  const actorId = guard.current.user.id;

  if (targetUserId === actorId && newRole !== "admin") {
    return { ok: false, error: "No puedes degradar tu propia cuenta de administrador." };
  }

  const admin = createAdminClient();

  const { data: target, error: fetchErr } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", targetUserId)
    .single();

  if (fetchErr || !target) {
    return { ok: false, error: "El usuario no existe." };
  }

  if (target.role === newRole) {
    return { ok: false, error: "El usuario ya tiene ese rol." };
  }

  const { error: updErr } = await admin
    .from("profiles")
    .update({ role: newRole })
    .eq("id", targetUserId);

  if (updErr) {
    return { ok: false, error: `No se pudo actualizar el rol: ${updErr.message}` };
  }

  await writeAuditLog(actorId, "user.update_role", "user", targetUserId, {
    from: target.role,
    to: newRole,
  });

  return { ok: true };
}

// ─── toggleUserStatus ───────────────────────────────────────────────────────

/**
 * Alterna entre 'active' e 'inactive'. SOLO admin estricto.
 * Si pasa a inactive, también setea deleted_at=now(); al reactivar, deleted_at=null.
 */
export async function toggleUserStatus(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;

  const parsed = toggleUserStatusSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { targetUserId } = parsed.data;
  const actorId = guard.current.user.id;

  if (targetUserId === actorId) {
    return { ok: false, error: "No puedes desactivar tu propia cuenta." };
  }

  const admin = createAdminClient();

  const { data: target, error: fetchErr } = await admin
    .from("profiles")
    .select("id, status")
    .eq("id", targetUserId)
    .single();

  if (fetchErr || !target) {
    return { ok: false, error: "El usuario no existe." };
  }

  const nowIso = new Date().toISOString();
  const nextStatus = target.status === "active" ? "inactive" : "active";

  const patch: { status: "active" | "inactive"; deleted_at: string | null } =
    nextStatus === "inactive"
      ? { status: "inactive", deleted_at: nowIso }
      : { status: "active", deleted_at: null };

  const { error: updErr } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", targetUserId);

  if (updErr) {
    return { ok: false, error: `No se pudo cambiar el estado: ${updErr.message}` };
  }

  // Si pasamos a inactive, cerrar sesiones globales del target.
  if (nextStatus === "inactive") {
    try {
      await admin.auth.admin.signOut(targetUserId, "global");
    } catch {
      // best-effort; el cambio de status ya quedó.
    }
  }

  await writeAuditLog(actorId, "user.toggle_status", "user", targetUserId, {
    from: target.status,
    to: nextStatus,
  });

  return { ok: true };
}
