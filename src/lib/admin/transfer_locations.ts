"use server";

/**
 * Transfer locations (PM 2026-06-11): puntos de recogida/destino alimentan
 * los dropdowns "Desde / Hasta" del buscador de traslados público. Antes
 * estaban hardcoded en el JSX; ahora el admin los administra desde el panel.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  firstZodError,
  getStaffWithPermissionOrError,
  writeAuditLog,
} from "./_shared";
import type { ActionResult } from "./types";
import type { Tables } from "@/lib/supabase/database.types";

export type TransferLocationRow = Tables<"transfer_locations">;

export async function listTransferLocations(): Promise<TransferLocationRow[]> {
  // Lectura admin (incluye inactivos para gestionarlos). El sitio público usa
  // src/lib/queries/catalog.ts:getTransferLocations() que filtra active=true.
  const guard = await getStaffWithPermissionOrError("transfers:read");
  if (!guard.ok) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transfer_locations")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("label_es", { ascending: true });

  if (error) {
    console.error("[listTransferLocations]", error.message);
    return [];
  }
  return data ?? [];
}

const baseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nombre técnico requerido")
    .max(60, "Demasiado largo")
    .regex(/^[a-z0-9_-]+$/, "Solo minúsculas, dígitos, '_' o '-'"),
  label_es: z.string().trim().min(1, "Etiqueta ES requerida").max(120),
  label_en: z.string().trim().min(1, "Etiqueta EN requerida").max(120),
  sort_order: z.coerce.number().int().min(0).max(9999).default(100),
  active: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "string" ? v === "true" : v))
    .default(true),
});

const updateSchema = baseSchema.extend({ id: z.string().uuid() });

function parseFd(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    label_es: formData.get("label_es") ?? "",
    label_en: formData.get("label_en") ?? "",
    sort_order: formData.get("sort_order") ?? 100,
    active: formData.get("active") ?? "true",
  };
}

export async function createTransferLocation(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:write");
  if (!guard.ok) return guard;

  const parsed = baseSchema.safeParse(parseFd(formData));
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("transfer_locations").insert(parsed.data);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe un destino con ese nombre técnico." };
    }
    return { ok: false, error: `No se pudo crear el destino: ${error.message}` };
  }

  await writeAuditLog(
    guard.current.user.id,
    "transfer_location.create",
    "transfer_location",
    null,
    { name: parsed.data.name }
  );
  return { ok: true };
}

export async function updateTransferLocation(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:write");
  if (!guard.ok) return guard;

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    ...parseFd(formData),
  });
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  const { id, ...patch } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("transfer_locations")
    .update(patch)
    .eq("id", id);
  if (error) return { ok: false, error: `No se pudo actualizar: ${error.message}` };

  await writeAuditLog(
    guard.current.user.id,
    "transfer_location.update",
    "transfer_location",
    id,
    { name: patch.name }
  );
  return { ok: true };
}

export async function deleteTransferLocation(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:delete");
  if (!guard.ok) return guard;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  // Soft delete: marcamos como inactivo para no romper rutas históricas
  // que ya referencien este punto por nombre.
  const { error } = await supabase
    .from("transfer_locations")
    .update({ active: false })
    .eq("id", id);
  if (error) return { ok: false, error: `No se pudo desactivar: ${error.message}` };

  await writeAuditLog(
    guard.current.user.id,
    "transfer_location.delete",
    "transfer_location",
    id,
    null
  );
  return { ok: true };
}
