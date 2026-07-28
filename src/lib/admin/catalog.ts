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
  createStaySchema,
  createTourSchema,
  createTransferRouteSchema,
  createVehicleSchema,
  deleteStaySchema,
  deleteTourSchema,
  deleteTransferRouteSchema,
  deleteVehicleSchema,
  parseJsonArray,
  updateStaySchema,
  updateTourSchema,
  updateTransferRouteSchema,
  updateVehicleSchema,
} from "./schemas";

// ─── Helpers de extracción ──────────────────────────────────────────────────

function asNumberOrNull(fd: FormData, field: string): number | null {
  const v = fd.get(field);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function asBool(fd: FormData, field: string): boolean {
  const v = fd.get(field);
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  const norm = String(v).trim().toLowerCase();
  return norm === "true" || norm === "on" || norm === "1" || norm === "yes";
}

/**
 * Lee un campo `field` que puede venir como:
 *  - múltiples valores (FormData.getAll) ej: amenities=wifi&amenities=pool
 *  - un único string JSON: amenities='["wifi","pool"]'
 *  - un string CSV: amenities='wifi,pool'
 */
function readListField(fd: FormData, field: string): string[] {
  const all = readStringArray(fd, field);
  if (all.length > 1) return all;
  // Si solo vino un valor, intentar parsear como JSON/CSV.
  const single = readString(fd, field);
  if (single === null) return [];
  return parseJsonArray(single);
}

/**
 * Lee `pricing_extras` como JSON string (lo serializamos en el client). Si
 * no viene o no parsea, devuelve []. Zod valida la shape después.
 */
function readPricingExtras(fd: FormData): unknown {
  const raw = fd.get("pricing_extras");
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try { return JSON.parse(raw); } catch { return []; }
}

/**
 * PM 2026-06-15: lee markup_type + markup_value. Valores vacíos / "none" /
 * null normalizan a (null, null) para que el form pueda enviar "limpiar
 * markup" simplemente dejando el campo vacío. La validación cruzada vive en
 * el schema (validateMarkup).
 */
function readMarkup(fd: FormData): { markup_type: "percent" | "amount" | null; markup_value: number | null } {
  const rawType = fd.get("markup_type");
  const type = typeof rawType === "string" ? rawType.trim().toLowerCase() : "";
  if (type !== "percent" && type !== "amount") {
    return { markup_type: null, markup_value: null };
  }
  const rawVal = fd.get("markup_value");
  if (typeof rawVal !== "string" || rawVal.trim() === "") {
    return { markup_type: type as "percent" | "amount", markup_value: null };
  }
  const n = Number(rawVal);
  return {
    markup_type: type as "percent" | "amount",
    markup_value: Number.isFinite(n) ? n : null,
  };
}

// ===========================================================================
// STAYS
// ===========================================================================

export async function createStay(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("stays:write");
  if (!guard.ok) return guard;

  const parsed = createStaySchema.safeParse({
    slug: formData.get("slug"),
    title_es: formData.get("title_es"),
    title_en: formData.get("title_en") ?? "",
    description_es: formData.get("description_es") ?? "",
    description_en: formData.get("description_en") ?? "",
    short_desc_es: formData.get("short_desc_es") ?? "",
    short_desc_en: formData.get("short_desc_en") ?? "",
    price_cents: formData.get("price_cents"),
    max_guests: formData.get("max_guests"),
    bedrooms: formData.get("bedrooms"),
    bathrooms: formData.get("bathrooms"),
    amenities: readListField(formData, "amenities"),
    images: readListField(formData, "images"),
    location: formData.get("location") ?? "",
    lat: asNumberOrNull(formData, "lat"),
    lng: asNumberOrNull(formData, "lng"),
    featured: asBool(formData, "featured"),
    active: asBool(formData, "active"),
    partner_id: formData.get("partner_id") ?? "",
    partner_url: formData.get("partner_url") ?? "",
    pricing_unit: formData.get("pricing_unit") ?? undefined,
    pricing_extras: readPricingExtras(formData),
    category: formData.get("category") ?? "",
    check_in_time: formData.get("check_in_time") ?? "",
    check_out_time: formData.get("check_out_time") ?? "",
    cancellation_policy: formData.get("cancellation_policy") ?? "",
    house_rules: formData.get("house_rules") ?? "",
    // PM 2026-07-27: bilingüe.
    cancellation_policy_es: formData.get("cancellation_policy_es") ?? "",
    cancellation_policy_en: formData.get("cancellation_policy_en") ?? "",
    house_rules_es: formData.get("house_rules_es") ?? "",
    house_rules_en: formData.get("house_rules_en") ?? "",
    experience_id: formData.get("experience_id") ?? "",
    // PM 2026-07-09: type libre + stars 1-5.
    stay_type: formData.get("stay_type") ?? "",
    stars: formData.get("stars") ?? "",
    ...readMarkup(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const d = parsed.data;

  const { data, error } = await supabase
    .from("stays")
    .insert({
      // PM 2026-07-09: stay_type + stars. Cast as never porque los types
      // generados aún no incluyen estas columnas (nueva migración).
      stay_type: (d.stay_type || null) as never,
      stars: (d.stars ?? null) as never,
      slug: d.slug,
      title_es: d.title_es,
      title_en: d.title_en || null,
      description_es: d.description_es || null,
      description_en: d.description_en || null,
      short_desc_es: d.short_desc_es || null,
      short_desc_en: d.short_desc_en || null,
      price_cents: d.price_cents,
      max_guests: d.max_guests,
      bedrooms: d.bedrooms,
      bathrooms: d.bathrooms,
      amenities: d.amenities as never,
      images: d.images as never,
      location: d.location || null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      featured: d.featured,
      active: d.active,
      partner_id: d.partner_id ?? null,
      partner_url: d.partner_url ?? null,
      pricing_unit: d.pricing_unit,
      pricing_extras: d.pricing_extras as never,
      category: d.category || null,
      // PM 2026-06-25: FK a experiences. Cast as never porque los types
      // generados aún no incluyen experience_id en stays. Si la columna
      // no existe en DB, Postgres devuelve 42703 y el caller reporta.
      experience_id: (d.experience_id ?? null) as never,
      markup_type: d.markup_type ?? null,
      markup_value: d.markup_value ?? null,
      ...(("check_in_time" in d) ? ({
        check_in_time: (d as { check_in_time?: string }).check_in_time || null,
        check_out_time: (d as { check_out_time?: string }).check_out_time || null,
        cancellation_policy: (d as { cancellation_policy?: string }).cancellation_policy || null,
        house_rules: (d as { house_rules?: string }).house_rules || null,
        // PM 2026-07-27: versiones bilingües. Cast del bloque entero
        // porque los types generados aún no incluyen las columnas
        // _es/_en hasta regenerar tras la migración 20260727000000.
        cancellation_policy_es: (d as { cancellation_policy_es?: string }).cancellation_policy_es || null,
        cancellation_policy_en: (d as { cancellation_policy_en?: string }).cancellation_policy_en || null,
        house_rules_es: (d as { house_rules_es?: string }).house_rules_es || null,
        house_rules_en: (d as { house_rules_en?: string }).house_rules_en || null,
      } as never) : {}),
      created_by: actorId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe un alojamiento con ese slug." };
    }
    return { ok: false, error: `No se pudo crear el alojamiento: ${error.message}` };
  }

  await writeAuditLog(actorId, "stay.create", "stay", data?.id ?? null, {
    slug: d.slug,
  });
  return { ok: true };
}

export async function updateStay(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("stays:write");
  if (!guard.ok) return guard;

  const parsed = updateStaySchema.safeParse({
    id: formData.get("id"),
    slug: formData.get("slug"),
    title_es: formData.get("title_es"),
    title_en: formData.get("title_en") ?? "",
    description_es: formData.get("description_es") ?? "",
    description_en: formData.get("description_en") ?? "",
    short_desc_es: formData.get("short_desc_es") ?? "",
    short_desc_en: formData.get("short_desc_en") ?? "",
    price_cents: formData.get("price_cents"),
    max_guests: formData.get("max_guests"),
    bedrooms: formData.get("bedrooms"),
    bathrooms: formData.get("bathrooms"),
    amenities: readListField(formData, "amenities"),
    images: readListField(formData, "images"),
    location: formData.get("location") ?? "",
    lat: asNumberOrNull(formData, "lat"),
    lng: asNumberOrNull(formData, "lng"),
    featured: asBool(formData, "featured"),
    active: asBool(formData, "active"),
    partner_id: formData.get("partner_id") ?? "",
    partner_url: formData.get("partner_url") ?? "",
    pricing_unit: formData.get("pricing_unit") ?? undefined,
    pricing_extras: readPricingExtras(formData),
    category: formData.get("category") ?? "",
    check_in_time: formData.get("check_in_time") ?? "",
    check_out_time: formData.get("check_out_time") ?? "",
    cancellation_policy: formData.get("cancellation_policy") ?? "",
    house_rules: formData.get("house_rules") ?? "",
    experience_id: formData.get("experience_id") ?? "",
    stay_type: formData.get("stay_type") ?? "",
    stars: formData.get("stars") ?? "",
    ...readMarkup(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id, ...d } = parsed.data;

  const { error } = await supabase
    .from("stays")
    .update({
      stay_type: (d.stay_type || null) as never,
      stars: (d.stars ?? null) as never,
      slug: d.slug,
      title_es: d.title_es,
      title_en: d.title_en || null,
      description_es: d.description_es || null,
      description_en: d.description_en || null,
      short_desc_es: d.short_desc_es || null,
      short_desc_en: d.short_desc_en || null,
      price_cents: d.price_cents,
      max_guests: d.max_guests,
      bedrooms: d.bedrooms,
      bathrooms: d.bathrooms,
      amenities: d.amenities as never,
      images: d.images as never,
      location: d.location || null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      featured: d.featured,
      active: d.active,
      partner_id: d.partner_id ?? null,
      partner_url: d.partner_url ?? null,
      pricing_unit: d.pricing_unit,
      pricing_extras: d.pricing_extras as never,
      category: d.category || null,
      // PM 2026-06-25: FK a experiences. Cast as never porque los types
      // generados aún no incluyen experience_id en stays. Si la columna
      // no existe en DB, Postgres devuelve 42703 y el caller reporta.
      experience_id: (d.experience_id ?? null) as never,
      markup_type: d.markup_type ?? null,
      markup_value: d.markup_value ?? null,
      ...(("check_in_time" in d) ? ({
        check_in_time: (d as { check_in_time?: string }).check_in_time || null,
        check_out_time: (d as { check_out_time?: string }).check_out_time || null,
        cancellation_policy: (d as { cancellation_policy?: string }).cancellation_policy || null,
        house_rules: (d as { house_rules?: string }).house_rules || null,
        // PM 2026-07-27: versiones bilingües. Cast del bloque entero
        // porque los types generados aún no incluyen las columnas
        // _es/_en hasta regenerar tras la migración 20260727000000.
        cancellation_policy_es: (d as { cancellation_policy_es?: string }).cancellation_policy_es || null,
        cancellation_policy_en: (d as { cancellation_policy_en?: string }).cancellation_policy_en || null,
        house_rules_es: (d as { house_rules_es?: string }).house_rules_es || null,
        house_rules_en: (d as { house_rules_en?: string }).house_rules_en || null,
      } as never) : {}),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe un alojamiento con ese slug." };
    }
    return { ok: false, error: `No se pudo actualizar el alojamiento: ${error.message}` };
  }

  await writeAuditLog(actorId, "stay.update", "stay", id, { slug: d.slug });
  return { ok: true };
}

export async function deleteStay(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("stays:delete");
  if (!guard.ok) return guard;

  const parsed = deleteStaySchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id } = parsed.data;

  // PM 2026-06-23 (D): HARD delete. Antes era soft (active:false) pero
  // como el admin carga incluyendo inactivos, el registro "eliminado"
  // seguía apareciendo y confundía. Para ocultar sin borrar el admin
  // usa el toggle "Oculto" (status hidden). DELETE es definitivo.
  // Si hay FKs (invoice_items con stay_id), Postgres devuelve 23503;
  // lo mapeamos a un mensaje claro que recomienda ocultar en lugar.
  const { error } = await supabase
    .from("stays")
    .delete()
    .eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "No se puede eliminar: este alojamiento tiene facturas o reservas asociadas. Ocultalo desde el toggle de estado.",
      };
    }
    return { ok: false, error: `No se pudo eliminar el alojamiento: ${error.message}` };
  }

  await writeAuditLog(actorId, "stay.delete", "stay", id, null);
  return { ok: true };
}

// ===========================================================================
// TOURS
// ===========================================================================

export async function createTour(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("tours:write");
  if (!guard.ok) return guard;

  const parsed = createTourSchema.safeParse({
    slug: formData.get("slug"),
    title_es: formData.get("title_es"),
    title_en: formData.get("title_en") ?? "",
    description_es: formData.get("description_es") ?? "",
    description_en: formData.get("description_en") ?? "",
    short_desc_es: formData.get("short_desc_es") ?? "",
    short_desc_en: formData.get("short_desc_en") ?? "",
    price_cents: formData.get("price_cents"),
    duration_minutes: formData.get("duration_minutes"),
    max_pax: formData.get("max_pax"),
    difficulty: formData.get("difficulty") ?? "",
    meeting_point: formData.get("meeting_point") ?? "",
    operating_day: formData.get("operating_day") ?? "",
    // PM 2026-07-27: contenido extendido persistido.
    experience_es: formData.get("experience_es") ?? "",
    experience_en: formData.get("experience_en") ?? "",
    important_notes_es: formData.get("important_notes_es") ?? "",
    important_notes_en: formData.get("important_notes_en") ?? "",
    perfect_for: readListField(formData, "perfect_for"),
    highlights: readListField(formData, "highlights"),
    includes: readListField(formData, "includes"),
    images: readListField(formData, "images"),
    location: formData.get("location") ?? "",
    lat: asNumberOrNull(formData, "lat"),
    lng: asNumberOrNull(formData, "lng"),
    featured: asBool(formData, "featured"),
    active: asBool(formData, "active"),
    partner_id: formData.get("partner_id") ?? "",
    partner_url: formData.get("partner_url") ?? "",
    pricing_unit: formData.get("pricing_unit") ?? undefined,
    pricing_extras: readPricingExtras(formData),
    category: formData.get("category") ?? "",
    experience_category: formData.get("experience_category") ?? "",
    experience_id: formData.get("experience_id") ?? "",
    partner_name: formData.get("partner_name") ?? "",
    markup_pct: formData.get("markup_pct") ?? 10,
    ...readMarkup(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const d = parsed.data;

  const { data, error } = await supabase
    .from("tours")
    .insert({
      // PM 2026-07-10: operating_day (cast as never porque los types
      // generados no incluyen la columna hasta regenerar tras la
      // migración 20260710000000).
      operating_day: ((d as { operating_day?: string }).operating_day || null) as never,
      // PM 2026-07-27: contenido extendido persistido en DB.
      experience_es: (((d as { experience_es?: string }).experience_es) || null) as never,
      experience_en: (((d as { experience_en?: string }).experience_en) || null) as never,
      important_notes_es: (((d as { important_notes_es?: string }).important_notes_es) || null) as never,
      important_notes_en: (((d as { important_notes_en?: string }).important_notes_en) || null) as never,
      perfect_for: ((d as { perfect_for?: string[] }).perfect_for ?? []) as never,
      highlights: ((d as { highlights?: string[] }).highlights ?? []) as never,
      slug: d.slug,
      title_es: d.title_es,
      title_en: d.title_en || null,
      description_es: d.description_es || null,
      description_en: d.description_en || null,
      short_desc_es: d.short_desc_es || null,
      short_desc_en: d.short_desc_en || null,
      price_cents: d.price_cents,
      duration_minutes: d.duration_minutes,
      max_pax: d.max_pax,
      difficulty: d.difficulty || null,
      meeting_point: d.meeting_point || null,
      includes: d.includes as never,
      images: d.images as never,
      location: d.location || null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      featured: d.featured,
      active: d.active,
      partner_id: d.partner_id ?? null,
      partner_url: d.partner_url ?? null,
      pricing_unit: d.pricing_unit,
      pricing_extras: d.pricing_extras as never,
      category: d.category || null,
      experience_category: d.experience_category ?? null,
      // PM 2026-06-25: FK a tabla `experiences`. Casteado as never porque
      // los types generados aún no incluyen experience_id (regenerar con
      // supabase gen types tras aplicar migración). Si la columna no
      // existe en DB, Postgres devuelve 42703 y el caller reporta.
      experience_id: (d.experience_id ?? null) as never,
      partner_name: d.partner_name || null,
      markup_pct: d.markup_pct,
      markup_type: d.markup_type ?? null,
      markup_value: d.markup_value ?? null,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe un tour con ese slug." };
    }
    return { ok: false, error: `No se pudo crear el tour: ${error.message}` };
  }

  await writeAuditLog(actorId, "tour.create", "tour", data?.id ?? null, {
    slug: d.slug,
  });
  return { ok: true };
}

export async function updateTour(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("tours:write");
  if (!guard.ok) return guard;

  const parsed = updateTourSchema.safeParse({
    id: formData.get("id"),
    slug: formData.get("slug"),
    title_es: formData.get("title_es"),
    title_en: formData.get("title_en") ?? "",
    description_es: formData.get("description_es") ?? "",
    description_en: formData.get("description_en") ?? "",
    short_desc_es: formData.get("short_desc_es") ?? "",
    short_desc_en: formData.get("short_desc_en") ?? "",
    price_cents: formData.get("price_cents"),
    duration_minutes: formData.get("duration_minutes"),
    max_pax: formData.get("max_pax"),
    difficulty: formData.get("difficulty") ?? "",
    meeting_point: formData.get("meeting_point") ?? "",
    operating_day: formData.get("operating_day") ?? "",
    // PM 2026-07-27: contenido extendido persistido.
    experience_es: formData.get("experience_es") ?? "",
    experience_en: formData.get("experience_en") ?? "",
    important_notes_es: formData.get("important_notes_es") ?? "",
    important_notes_en: formData.get("important_notes_en") ?? "",
    perfect_for: readListField(formData, "perfect_for"),
    highlights: readListField(formData, "highlights"),
    includes: readListField(formData, "includes"),
    images: readListField(formData, "images"),
    location: formData.get("location") ?? "",
    lat: asNumberOrNull(formData, "lat"),
    lng: asNumberOrNull(formData, "lng"),
    featured: asBool(formData, "featured"),
    active: asBool(formData, "active"),
    partner_id: formData.get("partner_id") ?? "",
    partner_url: formData.get("partner_url") ?? "",
    pricing_unit: formData.get("pricing_unit") ?? undefined,
    pricing_extras: readPricingExtras(formData),
    category: formData.get("category") ?? "",
    experience_category: formData.get("experience_category") ?? "",
    experience_id: formData.get("experience_id") ?? "",
    partner_name: formData.get("partner_name") ?? "",
    markup_pct: formData.get("markup_pct") ?? 10,
    ...readMarkup(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id, ...d } = parsed.data;

  const { error } = await supabase
    .from("tours")
    .update({
      // PM 2026-07-10: operating_day (columna nueva).
      operating_day: ((d as { operating_day?: string }).operating_day || null) as never,
      slug: d.slug,
      title_es: d.title_es,
      title_en: d.title_en || null,
      description_es: d.description_es || null,
      description_en: d.description_en || null,
      short_desc_es: d.short_desc_es || null,
      short_desc_en: d.short_desc_en || null,
      price_cents: d.price_cents,
      duration_minutes: d.duration_minutes,
      max_pax: d.max_pax,
      difficulty: d.difficulty || null,
      meeting_point: d.meeting_point || null,
      includes: d.includes as never,
      images: d.images as never,
      location: d.location || null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      featured: d.featured,
      active: d.active,
      partner_id: d.partner_id ?? null,
      partner_url: d.partner_url ?? null,
      pricing_unit: d.pricing_unit,
      pricing_extras: d.pricing_extras as never,
      category: d.category || null,
      experience_category: d.experience_category ?? null,
      // PM 2026-06-25: FK a tabla `experiences`. Casteado as never porque
      // los types generados aún no incluyen experience_id (regenerar con
      // supabase gen types tras aplicar migración). Si la columna no
      // existe en DB, Postgres devuelve 42703 y el caller reporta.
      experience_id: (d.experience_id ?? null) as never,
      partner_name: d.partner_name || null,
      markup_pct: d.markup_pct,
      markup_type: d.markup_type ?? null,
      markup_value: d.markup_value ?? null,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe un tour con ese slug." };
    }
    return { ok: false, error: `No se pudo actualizar el tour: ${error.message}` };
  }

  await writeAuditLog(actorId, "tour.update", "tour", id, { slug: d.slug });
  return { ok: true };
}

export async function deleteTour(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("tours:delete");
  if (!guard.ok) return guard;

  const parsed = deleteTourSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id } = parsed.data;

  // PM 2026-06-23 (D): HARD delete (ver comentario en deleteStay). El
  // soft-delete previo (active:false) seguía visible en el dashboard
  // del admin que carga inactivos también.
  const { error } = await supabase
    .from("tours")
    .delete()
    .eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "No se puede eliminar: este tour tiene facturas o reservas asociadas. Ocultalo desde el toggle de estado.",
      };
    }
    return { ok: false, error: `No se pudo eliminar el tour: ${error.message}` };
  }

  await writeAuditLog(actorId, "tour.delete", "tour", id, null);
  return { ok: true };
}

// ===========================================================================
// TRANSFER ROUTES
// ===========================================================================

export async function createTransferRoute(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:write");
  if (!guard.ok) return guard;

  const parsed = createTransferRouteSchema.safeParse({
    from_location: formData.get("from_location"),
    to_location: formData.get("to_location"),
    base_price_cents: formData.get("base_price_cents"),
    pricing_unit: formData.get("pricing_unit") ?? undefined,
    distance_km: asNumberOrNull(formData, "distance_km"),
    duration_minutes: asNumberOrNull(formData, "duration_minutes"),
    max_pax: formData.get("max_pax"),
    active: asBool(formData, "active"),
    featured: asBool(formData, "featured"),
    vehicle_id: formData.get("vehicle_id") ?? "",
    description_es: formData.get("description_es") ?? "",
    description_en: formData.get("description_en") ?? "",
    pricing_mode: formData.get("pricing_mode") ?? "route_price",
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const d = parsed.data;

  const { data, error } = await supabase
    .from("transfer_routes")
    .insert({
      from_location: d.from_location,
      to_location: d.to_location,
      base_price_cents: d.base_price_cents,
      pricing_unit: d.pricing_unit,
      distance_km: d.distance_km ?? null,
      duration_minutes: d.duration_minutes ?? null,
      max_pax: d.max_pax,
      active: d.active,
      featured: d.featured,
      vehicle_id: d.vehicle_id || null,
      description_es: d.description_es || null,
      description_en: d.description_en || null,
      pricing_mode: d.pricing_mode,
    })
    .select("id")
    .single();

  if (error) {
    // UNIQUE(from_location, to_location): mensaje amigable en vez del SQL crudo.
    if (error.code === "23505" || /duplicate key/i.test(error.message)) {
      return {
        ok: false,
        error: `Ya existe una ruta "${d.from_location} → ${d.to_location}". Editá la existente o usá otro origen/destino.`,
      };
    }
    return { ok: false, error: `No se pudo crear la ruta: ${error.message}` };
  }

  await writeAuditLog(
    actorId,
    "transfer_route.create",
    "transfer_route",
    data?.id ?? null,
    { from: d.from_location, to: d.to_location }
  );
  return { ok: true };
}

export async function updateTransferRoute(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:write");
  if (!guard.ok) return guard;

  const parsed = updateTransferRouteSchema.safeParse({
    id: formData.get("id"),
    from_location: formData.get("from_location"),
    to_location: formData.get("to_location"),
    base_price_cents: formData.get("base_price_cents"),
    pricing_unit: formData.get("pricing_unit") ?? undefined,
    distance_km: asNumberOrNull(formData, "distance_km"),
    duration_minutes: asNumberOrNull(formData, "duration_minutes"),
    max_pax: formData.get("max_pax"),
    active: asBool(formData, "active"),
    featured: asBool(formData, "featured"),
    vehicle_id: formData.get("vehicle_id") ?? "",
    description_es: formData.get("description_es") ?? "",
    description_en: formData.get("description_en") ?? "",
    pricing_mode: formData.get("pricing_mode") ?? "route_price",
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id, ...d } = parsed.data;

  const { error } = await supabase
    .from("transfer_routes")
    .update({
      from_location: d.from_location,
      to_location: d.to_location,
      base_price_cents: d.base_price_cents,
      pricing_unit: d.pricing_unit,
      distance_km: d.distance_km ?? null,
      duration_minutes: d.duration_minutes ?? null,
      max_pax: d.max_pax,
      active: d.active,
      featured: d.featured,
      vehicle_id: d.vehicle_id || null,
      description_es: d.description_es || null,
      description_en: d.description_en || null,
      pricing_mode: d.pricing_mode,
    })
    .eq("id", id);

  if (error) {
    return { ok: false, error: `No se pudo actualizar la ruta: ${error.message}` };
  }

  await writeAuditLog(actorId, "transfer_route.update", "transfer_route", id, {
    from: d.from_location,
    to: d.to_location,
  });
  return { ok: true };
}

export async function deleteTransferRoute(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:delete");
  if (!guard.ok) return guard;

  const parsed = deleteTransferRouteSchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id } = parsed.data;

  const { error } = await supabase
    .from("transfer_routes")
    .update({ active: false })
    .eq("id", id);

  if (error) {
    return { ok: false, error: `No se pudo eliminar la ruta: ${error.message}` };
  }

  await writeAuditLog(actorId, "transfer_route.delete", "transfer_route", id, null);
  return { ok: true };
}

// ===========================================================================
// VEHICLES
// ===========================================================================

export async function createVehicle(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:write");
  if (!guard.ok) return guard;

  const parsed = createVehicleSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") ?? "",
    max_pax: formData.get("max_pax"),
    max_luggage: formData.get("max_luggage"),
    price_cents: asNumberOrNull(formData, "price_cents"),
    image: formData.get("image") ?? "",
    active: asBool(formData, "active"),
    features: readListField(formData, "features"),
    description: formData.get("description") ?? "",
    price_per_km_cents: asNumberOrNull(formData, "price_per_km_cents"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const d = parsed.data;

  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      name: d.name,
      type: d.type || null,
      max_pax: d.max_pax,
      max_luggage: d.max_luggage,
      price_cents: d.price_cents ?? null,
      image: d.image || null,
      active: d.active,
      features: d.features as never,
      description: d.description || null,
      price_per_km_cents: d.price_per_km_cents ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: `No se pudo crear el vehículo: ${error.message}` };
  }

  await writeAuditLog(actorId, "vehicle.create", "vehicle", data?.id ?? null, {
    name: d.name,
  });
  return { ok: true };
}

export async function updateVehicle(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:write");
  if (!guard.ok) return guard;

  const parsed = updateVehicleSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    type: formData.get("type") ?? "",
    max_pax: formData.get("max_pax"),
    max_luggage: formData.get("max_luggage"),
    price_cents: asNumberOrNull(formData, "price_cents"),
    image: formData.get("image") ?? "",
    active: asBool(formData, "active"),
    features: readListField(formData, "features"),
    description: formData.get("description") ?? "",
    price_per_km_cents: asNumberOrNull(formData, "price_per_km_cents"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id, ...d } = parsed.data;

  const { error } = await supabase
    .from("vehicles")
    .update({
      name: d.name,
      type: d.type || null,
      max_pax: d.max_pax,
      max_luggage: d.max_luggage,
      price_cents: d.price_cents ?? null,
      image: d.image || null,
      active: d.active,
      features: d.features as never,
      description: d.description || null,
      price_per_km_cents: d.price_per_km_cents ?? null,
    })
    .eq("id", id);

  if (error) {
    return { ok: false, error: `No se pudo actualizar el vehículo: ${error.message}` };
  }

  await writeAuditLog(actorId, "vehicle.update", "vehicle", id, { name: d.name });
  return { ok: true };
}

export async function deleteVehicle(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("transfers:delete");
  if (!guard.ok) return guard;

  const parsed = deleteVehicleSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id } = parsed.data;

  const { error } = await supabase
    .from("vehicles")
    .update({ active: false })
    .eq("id", id);

  if (error) {
    return { ok: false, error: `No se pudo eliminar el vehículo: ${error.message}` };
  }

  await writeAuditLog(actorId, "vehicle.delete", "vehicle", id, null);
  return { ok: true };
}
