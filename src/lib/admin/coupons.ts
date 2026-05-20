"use server";

import { createClient } from "@/lib/supabase/server";
import {
  firstZodError,
  getAdminOrError,
  writeAuditLog,
} from "./_shared";
import type { ActionResult } from "./types";
import {
  createCouponSchema,
  deleteCouponSchema,
  toggleCouponActiveSchema,
  updateCouponSchema,
} from "./schemas";

// ─── Tipos locales ──────────────────────────────────────────────────────────
// Tablas nuevas (migración 20260520160000_coupons.sql). Hasta que se
// regeneren los tipos de Supabase post-push, accedemos vía cast.

export type CouponRow = {
  id: string;
  code: string;
  description_es: string | null;
  description_en: string | null;
  discount_pct: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CouponRedemptionRow = {
  id: string;
  coupon_id: string;
  user_id: string;
  booking_id: string | null;
  amount_cents: number;
  discount_cents: number;
  redeemed_at: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function asBool(fd: FormData, field: string): boolean {
  const v = fd.get(field);
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  const norm = String(v).trim().toLowerCase();
  return norm === "true" || norm === "on" || norm === "1" || norm === "yes";
}

function asIntOrNull(fd: FormData, field: string): number | null {
  const v = fd.get(field);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// ===========================================================================
// QUERY HELPERS
// ===========================================================================

/**
 * Lista cupones no borrados (incluye inactivos y expirados; el admin los ve
 * para mantenimiento). Orden: más reciente primero.
 */
export async function listCoupons(): Promise<CouponRow[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("coupons")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listCoupons]", error.message);
    return [];
  }
  return (data ?? []) as CouponRow[];
}

/**
 * Historial completo de canjes. Staff y admin pueden ver todos vía RLS.
 * Orden: más reciente primero.
 */
export async function listCouponHistory(): Promise<CouponRedemptionRow[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("coupon_redemptions")
    .select("*")
    .order("redeemed_at", { ascending: false });

  if (error) {
    console.error("[listCouponHistory]", error.message);
    return [];
  }
  return (data ?? []) as CouponRedemptionRow[];
}

// ===========================================================================
// SERVER ACTIONS
// ===========================================================================

export async function createCoupon(formData: FormData): Promise<ActionResult> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;

  const parsed = createCouponSchema.safeParse({
    code: formData.get("code"),
    description_es: formData.get("description_es") ?? "",
    description_en: formData.get("description_en") ?? "",
    discount_pct: formData.get("discount_pct"),
    max_uses: asIntOrNull(formData, "max_uses"),
    expires_at: formData.get("expires_at") ?? "",
    active: asBool(formData, "active"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const d = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("coupons")
    .insert({
      // Normalizamos a mayúsculas para que los códigos sean case-insensitive
      // a la práctica (la UNIQUE de DB sigue siendo case-sensitive).
      code: d.code.toUpperCase(),
      description_es: d.description_es || null,
      description_en: d.description_en || null,
      discount_pct: d.discount_pct,
      max_uses: d.max_uses ?? null,
      expires_at: d.expires_at && d.expires_at !== "" ? d.expires_at : null,
      active: d.active,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe un cupón con ese código." };
    }
    return { ok: false, error: `No se pudo crear el cupón: ${error.message}` };
  }

  await writeAuditLog(actorId, "coupon.create", "coupon", data?.id ?? null, {
    code: d.code.toUpperCase(),
    discount_pct: d.discount_pct,
  });
  return { ok: true };
}

export async function updateCoupon(formData: FormData): Promise<ActionResult> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;

  const parsed = updateCouponSchema.safeParse({
    id: formData.get("id"),
    code: formData.get("code"),
    description_es: formData.get("description_es") ?? "",
    description_en: formData.get("description_en") ?? "",
    discount_pct: formData.get("discount_pct"),
    max_uses: asIntOrNull(formData, "max_uses"),
    expires_at: formData.get("expires_at") ?? "",
    active: asBool(formData, "active"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id, ...d } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("coupons")
    .update({
      code: d.code.toUpperCase(),
      description_es: d.description_es || null,
      description_en: d.description_en || null,
      discount_pct: d.discount_pct,
      max_uses: d.max_uses ?? null,
      expires_at: d.expires_at && d.expires_at !== "" ? d.expires_at : null,
      active: d.active,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ya existe un cupón con ese código." };
    }
    return {
      ok: false,
      error: `No se pudo actualizar el cupón: ${error.message}`,
    };
  }

  await writeAuditLog(actorId, "coupon.update", "coupon", id, {
    code: d.code.toUpperCase(),
  });
  return { ok: true };
}

/**
 * Soft delete vía deleted_at = now(). No se elimina físicamente para
 * preservar la integridad del histórico de canjes.
 */
export async function deleteCoupon(formData: FormData): Promise<ActionResult> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;

  const parsed = deleteCouponSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const supabase = await createClient();
  const actorId = guard.current.user.id;
  const { id } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("coupons")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      error: `No se pudo eliminar el cupón: ${error.message}`,
    };
  }

  await writeAuditLog(actorId, "coupon.delete", "coupon", id, null);
  return { ok: true };
}

/**
 * Alterna el flag `active`. Requiere admin.
 */
export async function toggleCouponActive(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;

  const parsed = toggleCouponActiveSchema.safeParse({
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
    .from("coupons")
    .select("id, active")
    .eq("id", id)
    .single();

  if (readError || !existing) {
    return { ok: false, error: "No se encontró el cupón." };
  }

  const nextActive = !existing.active;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("coupons")
    .update({ active: nextActive })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      error: `No se pudo cambiar el estado del cupón: ${error.message}`,
    };
  }

  await writeAuditLog(actorId, "coupon.toggle_active", "coupon", id, {
    active: nextActive,
  });
  return { ok: true };
}
