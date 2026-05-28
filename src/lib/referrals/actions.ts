"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { logReferralSchema } from "@/lib/admin/schemas";

type LogReferralOk = { ok: true; redirect_url: string };
type LogReferralErr = { ok: false; error: string };
export type LogReferralResult = LogReferralOk | LogReferralErr;

function firstZodError(error: { errors: { message: string }[] }): string {
  return error.errors[0]?.message ?? "Datos inválidos";
}

function buildUrl(
  base: string,
  itemUrl: string | null,
  utmSource: string,
  affiliateCode: string | null,
  campaign: string,
  content: string
): string {
  // Si el partner_url del item es un URL completo, lo usamos como destino.
  // Si es una ruta relativa (/stay/123), la concatenamos al base.
  // Si no hay item url, el destino es el base_url del partner.
  let url: URL;
  try {
    if (itemUrl && /^https?:\/\//i.test(itemUrl)) {
      url = new URL(itemUrl);
    } else if (itemUrl) {
      url = new URL(itemUrl, base);
    } else {
      url = new URL(base);
    }
  } catch {
    // Si el base_url falla parsing, devolvemos string raw del partner para
    // evitar throw.
    return itemUrl || base;
  }
  url.searchParams.set("utm_source", utmSource || "prdise");
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("utm_content", content);
  if (affiliateCode) url.searchParams.set("ref", affiliateCode);
  return url.toString();
}

/**
 * logReferral: registra un click saliente a un partner y devuelve el URL
 * destino con UTMs aplicados. No hace redirect aquí (lo hace el cliente con
 * window.location o `<a target>`), solo registra y resuelve la URL.
 */
export async function logReferral(
  formData: FormData
): Promise<LogReferralResult> {
  const parsed = logReferralSchema.safeParse({
    partner_id: formData.get("partner_id"),
    item_type: formData.get("item_type"),
    item_id: formData.get("item_id"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }
  const { partner_id, item_type, item_id } = parsed.data;

  const supabase = await createClient();

  const { data: partner, error: pErr } = await supabase
    .from("partners")
    .select("base_url, utm_source, affiliate_code, active, deleted_at, slug")
    .eq("id", partner_id)
    .single();

  if (pErr || !partner) {
    return { ok: false, error: "Partner no encontrado" };
  }
  if (!partner.active || partner.deleted_at) {
    return { ok: false, error: "Este partner está inactivo" };
  }

  // Lookup partner_url específico del item (si existe).
  let itemPartnerUrl: string | null = null;
  let itemSlug = "";
  if (item_type === "stay") {
    const { data: stay } = await supabase
      .from("stays")
      .select("partner_url, slug")
      .eq("id", item_id)
      .single();
    itemPartnerUrl = stay?.partner_url ?? null;
    itemSlug = stay?.slug ?? "";
  } else if (item_type === "tour") {
    const { data: tour } = await supabase
      .from("tours")
      .select("partner_url, slug")
      .eq("id", item_id)
      .single();
    itemPartnerUrl = tour?.partner_url ?? null;
    itemSlug = tour?.slug ?? "";
  } else {
    return {
      ok: false,
      error: "Transfers no usan referrals: usa el flujo nativo",
    };
  }

  const redirect_url = buildUrl(
    partner.base_url,
    itemPartnerUrl,
    partner.utm_source ?? "prdise",
    partner.affiliate_code,
    `${partner.slug}_${item_type}`,
    itemSlug || item_id
  );

  // Capturar contexto del request para el log.
  const hdrs = await headers();
  const userAgent = hdrs.get("user-agent");
  const referer = hdrs.get("referer");
  const xff = hdrs.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0]?.trim() : null;

  // user_id opcional (registrar quién hizo click si está autenticado).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Insert no bloquea el redirect: si falla el log, devolvemos URL igual.
  await supabase.from("partner_referrals").insert({
    partner_id,
    item_type,
    item_id,
    user_id: user?.id ?? null,
    user_agent: userAgent ?? null,
    ip: ip ?? null,
    referrer: referer ?? null,
  });

  return { ok: true, redirect_url };
}
