"use server";

import { createClient } from "@/lib/supabase/server";
import {
  firstZodError,
  getStaffWithPermissionOrError,
  writeAuditLog,
} from "./_shared";
import type { ActionResult } from "./types";
import {
  createPartnerSchema,
  deletePartnerSchema,
  updatePartnerSchema,
} from "./schemas";

function asBool(fd: FormData, field: string): boolean {
  const v = fd.get(field);
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  const norm = String(v).trim().toLowerCase();
  return norm === "true" || norm === "on" || norm === "1" || norm === "yes";
}

// ===========================================================================
// PARTNERS — páginas aliadas (referrals)
// ===========================================================================

export async function createPartner(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("partners:write");
  if (!guard.ok) return guard;

  const parsed = createPartnerSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    base_url: formData.get("base_url"),
    logo: formData.get("logo") ?? "",
    contact_email: formData.get("contact_email") ?? "",
    contact_phone: formData.get("contact_phone") ?? "",
    notes_es: formData.get("notes_es") ?? "",
    notes_en: formData.get("notes_en") ?? "",
    utm_source: formData.get("utm_source") ?? "",
    affiliate_code: formData.get("affiliate_code") ?? "",
    active: asBool(formData, "active"),
    featured_on_home: asBool(formData, "featured_on_home"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const d = parsed.data;

  const { data, error } = await supabase
    .from("partners")
    .insert({
      name: d.name,
      slug: d.slug,
      base_url: d.base_url,
      logo: d.logo || null,
      contact_email: d.contact_email || null,
      contact_phone: d.contact_phone || null,
      notes_es: d.notes_es || null,
      notes_en: d.notes_en || null,
      utm_source: d.utm_source,
      affiliate_code: d.affiliate_code || null,
      active: d.active,
      featured_on_home: d.featured_on_home,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe un partner con ese slug." };
    }
    return { ok: false, error: `No se pudo crear el partner: ${error.message}` };
  }

  await writeAuditLog(actorId, "partner.create", "partner", data?.id ?? null, {
    slug: d.slug,
    name: d.name,
  });
  return { ok: true };
}

export async function updatePartner(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("partners:write");
  if (!guard.ok) return guard;

  const parsed = updatePartnerSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    base_url: formData.get("base_url"),
    logo: formData.get("logo") ?? "",
    contact_email: formData.get("contact_email") ?? "",
    contact_phone: formData.get("contact_phone") ?? "",
    notes_es: formData.get("notes_es") ?? "",
    notes_en: formData.get("notes_en") ?? "",
    utm_source: formData.get("utm_source") ?? "",
    affiliate_code: formData.get("affiliate_code") ?? "",
    active: asBool(formData, "active"),
    featured_on_home: asBool(formData, "featured_on_home"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id, ...d } = parsed.data;

  const { error } = await supabase
    .from("partners")
    .update({
      name: d.name,
      slug: d.slug,
      base_url: d.base_url,
      logo: d.logo || null,
      contact_email: d.contact_email || null,
      contact_phone: d.contact_phone || null,
      notes_es: d.notes_es || null,
      notes_en: d.notes_en || null,
      utm_source: d.utm_source,
      affiliate_code: d.affiliate_code || null,
      active: d.active,
      featured_on_home: d.featured_on_home,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe un partner con ese slug." };
    }
    return { ok: false, error: `No se pudo actualizar el partner: ${error.message}` };
  }

  await writeAuditLog(actorId, "partner.update", "partner", id, { slug: d.slug });
  return { ok: true };
}

export async function deletePartner(formData: FormData): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("partners:delete");
  if (!guard.ok) return guard;

  const parsed = deletePartnerSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id } = parsed.data;

  const { error } = await supabase
    .from("partners")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { ok: false, error: `No se pudo eliminar el partner: ${error.message}` };
  }

  await writeAuditLog(actorId, "partner.delete", "partner", id, null);
  return { ok: true };
}

export type PartnerReferralStat = {
  partner_id: string;
  count_30d: number;
};

export async function listPartnerReferralCounts(): Promise<
  ActionResult<PartnerReferralStat[]>
> {
  const guard = await getStaffWithPermissionOrError("referrals:read");
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("partner_referrals")
    .select("partner_id")
    .gte("redirected_at", since);

  if (error) {
    return { ok: false, error: `No se pudo cargar referrals: ${error.message}` };
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.partner_id, (counts.get(row.partner_id) ?? 0) + 1);
  }

  return {
    ok: true,
    data: Array.from(counts.entries()).map(([partner_id, count_30d]) => ({
      partner_id,
      count_30d,
    })),
  };
}
