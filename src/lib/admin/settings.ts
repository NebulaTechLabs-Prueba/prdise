"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getStaffWithPermissionOrError,
  writeAuditLog,
} from "./_shared";
import type { ActionResult } from "./types";
import type { Tables } from "@/lib/supabase/database.types";

export type SettingRow = Tables<"site_settings">;

// ===========================================================================
// QUERIES
// ===========================================================================

/**
 * Lista todos los settings ordenados por key. Cualquier staff con
 * settings:read puede ver. Para callers del lado público, usar
 * `src/lib/queries/settings.ts:getSiteSettings()` (RLS público).
 */
export async function listSiteSettings(): Promise<SettingRow[]> {
  const guard = await getStaffWithPermissionOrError("settings:read");
  if (!guard.ok) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select("*")
    .order("key", { ascending: true });

  if (error) {
    console.error("[listSiteSettings]", error.message);
    return [];
  }
  return data ?? [];
}

// ===========================================================================
// MUTATIONS
// ===========================================================================

/**
 * Upsert de un setting (admin via RLS fn_is_admin). Para keys nuevas que
 * no existían, inserta; para keys existentes, actualiza el value.
 */
export async function updateSiteSetting(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("settings:write");
  if (!guard.ok) return guard;

  const key = String(formData.get("key") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  if (!key) return { ok: false, error: "Key requerida" };
  if (key.length > 100) return { ok: false, error: "Key demasiado larga" };
  if (value.length > 10000) {
    return { ok: false, error: "Valor demasiado largo" };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;

  const { error } = await supabase.from("site_settings").upsert(
    {
      key,
      value,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) {
    return {
      ok: false,
      error: `No se pudo guardar el setting: ${error.message}`,
    };
  }

  await writeAuditLog(actorId, "settings.update", "setting", key, { value });
  return { ok: true };
}

/**
 * Actualiza varias keys en una sola transacción lógica. FormData debe traer
 * un campo `entries` con JSON `[{ key, value }, ...]`.
 */
export async function updateSiteSettingsBulk(
  formData: FormData
): Promise<ActionResult<{ updated: number }>> {
  const guard = await getStaffWithPermissionOrError("settings:write");
  if (!guard.ok) return guard;

  const raw = String(formData.get("entries") ?? "[]");
  let entries: Array<{ key: string; value: string }> = [];
  try {
    entries = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Formato de entries inválido" };
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, error: "Sin cambios" };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const nowIso = new Date().toISOString();

  const rows = entries
    .filter((e) => e && typeof e.key === "string" && e.key.trim().length > 0)
    .map((e) => ({
      key: e.key.trim(),
      value: String(e.value ?? ""),
      updated_by: actorId,
      updated_at: nowIso,
    }));

  if (rows.length === 0) return { ok: false, error: "Sin entries válidas" };

  const { error } = await supabase
    .from("site_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    return {
      ok: false,
      error: `No se pudieron guardar settings: ${error.message}`,
    };
  }

  await writeAuditLog(actorId, "settings.bulk_update", "setting", null, {
    keys: rows.map((r) => r.key),
  });

  return { ok: true, data: { updated: rows.length } };
}
