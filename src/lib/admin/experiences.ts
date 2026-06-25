"use server";

/**
 * PM 2026-06-25: experiencias dinámicas. El admin crea/edita/elimina
 * desde el panel; cada tour se asocia a una via FK experience_id.
 *
 * Tolerante a que la migración no esté aplicada todavía: los SELECT
 * devuelven [] y los mutators devuelven error explícito. El UI cae a
 * un fallback que no rompe el render.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  firstZodError,
  getStaffWithPermissionOrError,
  writeAuditLog,
} from "./_shared";
import type { ActionResult } from "./types";

export type ExperienceRow = {
  id: string;
  slug: string;
  name_es: string;
  name_en: string;
  description_es: string | null;
  description_en: string | null;
  color: string | null;
  sort_order: number;
  active: boolean;
  cover_image: string | null;
  created_at: string;
  updated_at: string;
};

// ── Públicas / no-admin lookup ────────────────────────────────────────────
export async function listExperiences(): Promise<ExperienceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiences" as never)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    // Tabla puede no existir aún (migración pendiente). NO romper UI.
    console.warn("[listExperiences] tabla no disponible aún:", error.message);
    return [];
  }
  return (data as unknown as ExperienceRow[]) ?? [];
}

// ── Admin CRUD ────────────────────────────────────────────────────────────
const baseSchema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
  name_es: z.string().min(1).max(120),
  name_en: z.string().min(1).max(120),
  description_es: z.string().max(2000).optional().default(""),
  description_en: z.string().max(2000).optional().default(""),
  color: z.string().max(40).optional().default("gold"),
  sort_order: z.number().int().min(0).max(9999).optional().default(100),
  active: z.boolean().optional().default(true),
  cover_image: z.string().max(500).optional().default(""),
});

function asBool(fd: FormData, field: string): boolean {
  const v = fd.get(field);
  if (v === null) return false;
  const norm = String(v).trim().toLowerCase();
  return norm === "true" || norm === "on" || norm === "1" || norm === "yes";
}

export async function createExperience(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const guard = await getStaffWithPermissionOrError("tours:write");
  if (!guard.ok) return guard;

  const parsed = baseSchema.safeParse({
    slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
    name_es: formData.get("name_es") ?? "",
    name_en: formData.get("name_en") ?? "",
    description_es: formData.get("description_es") ?? "",
    description_en: formData.get("description_en") ?? "",
    color: formData.get("color") ?? "gold",
    sort_order: Number(formData.get("sort_order") ?? 100),
    active: asBool(formData, "active"),
    cover_image: formData.get("cover_image") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiences" as never)
    .insert(parsed.data as never)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe una experiencia con ese slug." };
    if (error.code === "42P01") return { ok: false, error: "La tabla 'experiences' aún no está aplicada en la DB. Aplica la migración primero." };
    return { ok: false, error: `No se pudo crear: ${error.message}` };
  }
  await writeAuditLog(guard.current.user.id, "experience.create", "experience", (data as { id: string }).id, { slug: parsed.data.slug });
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateExperience(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("tours:write");
  if (!guard.ok) return guard;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  const parsed = baseSchema.safeParse({
    slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
    name_es: formData.get("name_es") ?? "",
    name_en: formData.get("name_en") ?? "",
    description_es: formData.get("description_es") ?? "",
    description_en: formData.get("description_en") ?? "",
    color: formData.get("color") ?? "gold",
    sort_order: Number(formData.get("sort_order") ?? 100),
    active: asBool(formData, "active"),
    cover_image: formData.get("cover_image") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("experiences" as never)
    .update(parsed.data as never)
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe una experiencia con ese slug." };
    return { ok: false, error: `No se pudo actualizar: ${error.message}` };
  }
  await writeAuditLog(guard.current.user.id, "experience.update", "experience", id, { slug: parsed.data.slug });
  return { ok: true };
}

export async function deleteExperience(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("tours:write");
  if (!guard.ok) return guard;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  // FK ON DELETE SET NULL: los tours quedan sin experiencia (no se borran).
  const { error } = await supabase
    .from("experiences" as never)
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: `No se pudo eliminar: ${error.message}` };
  await writeAuditLog(guard.current.user.id, "experience.delete", "experience", id, {});
  return { ok: true };
}
