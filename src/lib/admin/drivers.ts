"use server";

import { createClient } from "@/lib/supabase/server";
import {
  firstZodError,
  getStaffWithPermissionOrError,
  writeAuditLog,
} from "./_shared";
import type { ActionResult } from "./types";
import {
  createDriverSchema,
  deleteDriverSchema,
  toggleDriverVisibilitySchema,
  updateDriverSchema,
  type DriverStatusLiteral,
} from "./schemas";

// ─── Tipos locales ──────────────────────────────────────────────────────────
// La tabla `drivers` es nueva (migración 20260520150000_drivers.sql).
// Hasta que se regeneren los tipos de Supabase post-migración, accedemos
// vía cast. Estos tipos locales mantienen la forma del row para callers.

export type DriverRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  license: string | null;
  vehicle: string | null;
  emergency_phone: string | null;
  web_visible: boolean;
  status: DriverStatusLiteral;
  rating: number;
  trips_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function asBool(fd: FormData, field: string): boolean {
  const v = fd.get(field);
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  const norm = String(v).trim().toLowerCase();
  return norm === "true" || norm === "on" || norm === "1" || norm === "yes";
}

function readStatus(fd: FormData): string | null {
  const v = fd.get("status");
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// ===========================================================================
// QUERY HELPERS (no Server Actions; usables desde Server Components)
// ===========================================================================

/**
 * Lista todos los choferes no borrados. Requiere staff con `transfers:read`
 * (o admin). Las RLS permiten SELECT a cualquier autenticado, pero filtramos
 * aquí por consistencia con el resto del admin.
 */
export async function listDrivers(): Promise<DriverRow[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("drivers")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listDrivers]", error.message);
    return [];
  }
  return (data ?? []) as DriverRow[];
}

// ===========================================================================
// SERVER ACTIONS
// ===========================================================================

export async function createDriver(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:write");
  if (!guard.ok) return guard;

  const parsed = createDriverSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    license: formData.get("license") ?? "",
    vehicle: formData.get("vehicle") ?? "",
    emergency_phone: formData.get("emergency_phone") ?? "",
    status: readStatus(formData) ?? "available",
    web_visible: asBool(formData, "web_visible"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const d = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("drivers")
    .insert({
      name: d.name,
      phone: d.phone || null,
      email: d.email || null,
      license: d.license || null,
      vehicle: d.vehicle || null,
      emergency_phone: d.emergency_phone || null,
      status: d.status,
      web_visible: d.web_visible,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: `No se pudo crear el chofer: ${error.message}` };
  }

  await writeAuditLog(actorId, "driver.create", "driver", data?.id ?? null, {
    name: d.name,
  });
  return { ok: true };
}

export async function updateDriver(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:write");
  if (!guard.ok) return guard;

  const parsed = updateDriverSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    license: formData.get("license") ?? "",
    vehicle: formData.get("vehicle") ?? "",
    emergency_phone: formData.get("emergency_phone") ?? "",
    status: readStatus(formData) ?? "available",
    web_visible: asBool(formData, "web_visible"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id, ...d } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("drivers")
    .update({
      name: d.name,
      phone: d.phone || null,
      email: d.email || null,
      license: d.license || null,
      vehicle: d.vehicle || null,
      emergency_phone: d.emergency_phone || null,
      status: d.status,
      web_visible: d.web_visible,
    })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      error: `No se pudo actualizar el chofer: ${error.message}`,
    };
  }

  await writeAuditLog(actorId, "driver.update", "driver", id, { name: d.name });
  return { ok: true };
}

/**
 * Soft delete vía deleted_at = now(). No se elimina físicamente.
 */
export async function deleteDriver(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:write");
  if (!guard.ok) return guard;

  const parsed = deleteDriverSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("drivers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      error: `No se pudo eliminar el chofer: ${error.message}`,
    };
  }

  await writeAuditLog(actorId, "driver.delete", "driver", id, null);
  return { ok: true };
}

/**
 * Alterna `web_visible`. Requiere transfers:write.
 */
export async function toggleDriverVisibility(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:write");
  if (!guard.ok) return guard;

  const parsed = toggleDriverVisibilitySchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: readError } = await (supabase as any)
    .from("drivers")
    .select("id, web_visible")
    .eq("id", id)
    .single();

  if (readError || !existing) {
    return { ok: false, error: "No se encontró el chofer." };
  }

  const nextVisible = !existing.web_visible;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("drivers")
    .update({ web_visible: nextVisible })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      error: `No se pudo cambiar la visibilidad: ${error.message}`,
    };
  }

  await writeAuditLog(actorId, "driver.toggle_visibility", "driver", id, {
    web_visible: nextVisible,
  });
  return { ok: true };
}
