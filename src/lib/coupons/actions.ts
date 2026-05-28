"use server";

import { createClient } from "@/lib/supabase/server";

type ValidateOk = {
  ok: true;
  coupon: {
    id: string;
    code: string;
    description_es: string | null;
    description_en: string | null;
    discount_pct: number;
    max_uses: number | null;
    used_count: number;
    expires_at: string | null;
  };
};
type ValidateErr = { ok: false; error: string };
export type ValidateCouponResult = ValidateOk | ValidateErr;

/**
 * Valida un código de cupón contra la tabla `coupons` de Supabase y devuelve
 * los datos para que el cliente aplique el descuento.
 *
 * Reemplaza la implementación previa que leía de PRDISE.load("coupons",[])
 * en localStorage (datos demo). Ahora honra los cupones reales creados por
 * admin desde el panel.
 *
 * RLS: autenticados pueden leer cupones activos + no expirados + no borrados.
 * Acá filtramos también por code y validamos max_uses contra used_count.
 */
export async function validateCoupon(
  formData: FormData
): Promise<ValidateCouponResult> {
  const raw = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!raw) {
    return { ok: false, error: "Ingresa un código" };
  }

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("coupons")
    .select(
      "id, code, description_es, description_en, discount_pct, max_uses, used_count, expires_at, active, deleted_at"
    )
    .eq("code", raw)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "Código inválido" };
  }
  if (!data.active) {
    return { ok: false, error: "Cupón inactivo" };
  }
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { ok: false, error: "Cupón vencido" };
  }
  if (
    typeof data.max_uses === "number" &&
    data.max_uses > 0 &&
    (data.used_count ?? 0) >= data.max_uses
  ) {
    return { ok: false, error: "Cupón agotado" };
  }

  return {
    ok: true,
    coupon: {
      id: data.id,
      code: data.code,
      description_es: data.description_es ?? null,
      description_en: data.description_en ?? null,
      discount_pct: Number(data.discount_pct) || 0,
      max_uses: typeof data.max_uses === "number" ? data.max_uses : null,
      used_count: Number(data.used_count) || 0,
      expires_at: data.expires_at ?? null,
    },
  };
}
