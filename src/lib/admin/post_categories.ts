"use server";

/**
 * PM 2026-06-26: categorías de posts gestionadas por el admin.
 * Reemplaza el hardcoded del JSX (Season, Travel Advisory, etc.).
 *
 * posts.category sigue siendo TEXT (no FK) — guarda el slug. Lookup por
 * slug. Si se elimina una categoría, los posts que la usaban quedan con
 * el slug textual pero sin color (fallback gold en el badge).
 *
 * Tolerante a tabla inexistente para no romper deploy si la migración
 * no se aplicó.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  firstZodError,
  getStaffWithPermissionOrError,
  writeAuditLog,
} from "./_shared";
import type { ActionResult } from "./types";

export type PostCategoryRow = {
  id: string;
  slug: string;
  name_es: string;
  name_en: string;
  color: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listPostCategories(): Promise<PostCategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_categories" as never)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    console.warn("[listPostCategories] tabla no disponible aún:", error.message);
    return [];
  }
  return (data as unknown as PostCategoryRow[]) ?? [];
}

const baseSchema = z.object({
  slug: z.string().min(1).max(80),
  name_es: z.string().min(1).max(120),
  name_en: z.string().min(1).max(120),
  color: z.string().max(20).optional().default("#F5A623"),
  sort_order: z.number().int().min(0).max(9999).optional().default(100),
  active: z.boolean().optional().default(true),
});

function asBool(fd: FormData, field: string): boolean {
  const v = fd.get(field);
  if (v === null) return false;
  const norm = String(v).trim().toLowerCase();
  return norm === "true" || norm === "on" || norm === "1" || norm === "yes";
}

export async function createPostCategory(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const guard = await getStaffWithPermissionOrError("posts:write");
  if (!guard.ok) return guard;

  const parsed = baseSchema.safeParse({
    slug: String(formData.get("slug") ?? "").trim(),
    name_es: formData.get("name_es") ?? "",
    name_en: formData.get("name_en") ?? "",
    color: formData.get("color") ?? "#F5A623",
    sort_order: Number(formData.get("sort_order") ?? 100),
    active: asBool(formData, "active"),
  });
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_categories" as never)
    .insert(parsed.data as never)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe una categoría con ese slug." };
    if (error.code === "42P01") return { ok: false, error: "Tabla 'post_categories' no aplicada en DB. Aplica la migración." };
    return { ok: false, error: `No se pudo crear: ${error.message}` };
  }
  await writeAuditLog(guard.current.user.id, "post_category.create", "post_category", (data as { id: string }).id, { slug: parsed.data.slug });
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updatePostCategory(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("posts:write");
  if (!guard.ok) return guard;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  const parsed = baseSchema.safeParse({
    slug: String(formData.get("slug") ?? "").trim(),
    name_es: formData.get("name_es") ?? "",
    name_en: formData.get("name_en") ?? "",
    color: formData.get("color") ?? "#F5A623",
    sort_order: Number(formData.get("sort_order") ?? 100),
    active: asBool(formData, "active"),
  });
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("post_categories" as never)
    .update(parsed.data as never)
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe una categoría con ese slug." };
    return { ok: false, error: `No se pudo actualizar: ${error.message}` };
  }
  await writeAuditLog(guard.current.user.id, "post_category.update", "post_category", id, { slug: parsed.data.slug });
  return { ok: true };
}

export async function deletePostCategory(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("posts:write");
  if (!guard.ok) return guard;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  const { error } = await supabase.from("post_categories" as never).delete().eq("id", id);
  if (error) return { ok: false, error: `No se pudo eliminar: ${error.message}` };
  await writeAuditLog(guard.current.user.id, "post_category.delete", "post_category", id, {});
  return { ok: true };
}
