"use server";

import { createClient } from "@/lib/supabase/server";
import {
  firstZodError,
  getStaffWithPermissionOrError,
  readString,
  readStringArray,
  writeAuditLog,
} from "./_shared";
import type { ActionResult } from "./types";
import {
  createPostSchema,
  deletePostSchema,
  parseJsonArray,
  togglePostFeaturedSchema,
  togglePostPublishSchema,
  updatePostSchema,
} from "./schemas";

// ─── Helpers ────────────────────────────────────────────────────────────────

function asBool(fd: FormData, field: string): boolean {
  const v = fd.get(field);
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  const norm = String(v).trim().toLowerCase();
  return norm === "true" || norm === "on" || norm === "1" || norm === "yes";
}

function readListField(fd: FormData, field: string): string[] {
  const all = readStringArray(fd, field);
  if (all.length > 1) return all;
  const single = readString(fd, field);
  if (single === null) return [];
  return parseJsonArray(single);
}

function readStatus(fd: FormData): string | null {
  const v = fd.get("status");
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// ===========================================================================
// POSTS
// ===========================================================================

export async function createPost(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("posts:write");
  if (!guard.ok) return guard;

  const parsed = createPostSchema.safeParse({
    slug: formData.get("slug"),
    title_es: formData.get("title_es"),
    title_en: formData.get("title_en") ?? "",
    excerpt_es: formData.get("excerpt_es") ?? "",
    excerpt_en: formData.get("excerpt_en") ?? "",
    body_es: formData.get("body_es") ?? "",
    body_en: formData.get("body_en") ?? "",
    category: formData.get("category") ?? "",
    image: formData.get("image") ?? "",
    tags: readListField(formData, "tags"),
    featured: asBool(formData, "featured"),
    status: readStatus(formData) ?? "draft",
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const d = parsed.data;

  const { data, error } = await supabase
    .from("posts")
    .insert({
      slug: d.slug,
      title_es: d.title_es,
      title_en: d.title_en || null,
      excerpt_es: d.excerpt_es || null,
      excerpt_en: d.excerpt_en || null,
      body_es: d.body_es || null,
      body_en: d.body_en || null,
      category: d.category || null,
      image: d.image || null,
      tags: d.tags as never,
      featured: d.featured,
      status: d.status,
      author_id: actorId,
      // Si arranca publicado directo, sellar published_at.
      published_at: d.status === "published" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe un post con ese slug." };
    }
    return { ok: false, error: `No se pudo crear el post: ${error.message}` };
  }

  await writeAuditLog(actorId, "post.create", "post", data?.id ?? null, {
    slug: d.slug,
    status: d.status,
  });
  return { ok: true };
}

export async function updatePost(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("posts:write");
  if (!guard.ok) return guard;

  const parsed = updatePostSchema.safeParse({
    id: formData.get("id"),
    slug: formData.get("slug"),
    title_es: formData.get("title_es"),
    title_en: formData.get("title_en") ?? "",
    excerpt_es: formData.get("excerpt_es") ?? "",
    excerpt_en: formData.get("excerpt_en") ?? "",
    body_es: formData.get("body_es") ?? "",
    body_en: formData.get("body_en") ?? "",
    category: formData.get("category") ?? "",
    image: formData.get("image") ?? "",
    tags: readListField(formData, "tags"),
    featured: asBool(formData, "featured"),
    status: readStatus(formData) ?? "draft",
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id, ...d } = parsed.data;

  const { error } = await supabase
    .from("posts")
    .update({
      slug: d.slug,
      title_es: d.title_es,
      title_en: d.title_en || null,
      excerpt_es: d.excerpt_es || null,
      excerpt_en: d.excerpt_en || null,
      body_es: d.body_es || null,
      body_en: d.body_en || null,
      category: d.category || null,
      image: d.image || null,
      tags: d.tags as never,
      featured: d.featured,
      status: d.status,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe un post con ese slug." };
    }
    return { ok: false, error: `No se pudo actualizar el post: ${error.message}` };
  }

  await writeAuditLog(actorId, "post.update", "post", id, {
    slug: d.slug,
    status: d.status,
  });
  return { ok: true };
}

/**
 * Soft delete vía status='archived'. NO se elimina físicamente.
 * Requiere posts:write o admin.
 */
export async function deletePost(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("posts:write");
  if (!guard.ok) return guard;

  const parsed = deletePostSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id } = parsed.data;

  const { error } = await supabase
    .from("posts")
    .update({ status: "archived" })
    .eq("id", id);

  if (error) {
    return { ok: false, error: `No se pudo archivar el post: ${error.message}` };
  }

  await writeAuditLog(actorId, "post.delete", "post", id, null);
  return { ok: true };
}

/**
 * Alterna estado de publicación:
 *  - draft → published (sella published_at = now())
 *  - published → draft (limpia published_at)
 *  - cualquier otro estado (scheduled, archived) se trata como "no publicado"
 *    y pasa a published.
 * Requiere posts:publish o admin.
 */
export async function togglePostPublish(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("posts:publish");
  if (!guard.ok) return guard;

  const parsed = togglePostPublishSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id } = parsed.data;

  const { data: existing, error: readError } = await supabase
    .from("posts")
    .select("id, status")
    .eq("id", id)
    .single();

  if (readError || !existing) {
    return { ok: false, error: "No se encontró el post." };
  }

  const isPublished = existing.status === "published";
  const nextStatus = isPublished ? "draft" : "published";
  const nextPublishedAt = isPublished ? null : new Date().toISOString();

  const { error } = await supabase
    .from("posts")
    .update({
      status: nextStatus,
      published_at: nextPublishedAt,
    })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      error: `No se pudo cambiar el estado: ${error.message}`,
    };
  }

  await writeAuditLog(actorId, "post.toggle_publish", "post", id, {
    from: existing.status,
    to: nextStatus,
  });
  return { ok: true };
}

/**
 * Alterna el flag `featured`. Requiere posts:write o admin.
 */
export async function togglePostFeatured(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("posts:write");
  if (!guard.ok) return guard;

  const parsed = togglePostFeaturedSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id } = parsed.data;

  const { data: existing, error: readError } = await supabase
    .from("posts")
    .select("id, featured")
    .eq("id", id)
    .single();

  if (readError || !existing) {
    return { ok: false, error: "No se encontró el post." };
  }

  const nextFeatured = !existing.featured;

  const { error } = await supabase
    .from("posts")
    .update({ featured: nextFeatured })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      error: `No se pudo cambiar el destacado: ${error.message}`,
    };
  }

  await writeAuditLog(actorId, "post.toggle_featured", "post", id, {
    featured: nextFeatured,
  });
  return { ok: true };
}
