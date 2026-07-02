"use server";

/**
 * Payment provider configs (PM 2026-06-11): admin edita Stripe y PayPal
 * desde el panel. La tabla tiene RLS admin-only — las keys nunca se exponen
 * al cliente. invoices.ts lee desde acá (con fallback a env vars) cuando
 * crea Stripe Payment Links.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  firstZodError,
  getStaffOrError,
  writeAuditLog,
} from "./_shared";
import type { ActionResult } from "./types";
import type { Tables } from "@/lib/supabase/database.types";

export type PaymentConfigRow = Tables<"payment_provider_configs">;

/**
 * PM 2026-06-29: status público de qué proveedores están conectados.
 * No requiere staff — devuelve solo booleans, sin keys. Lo usa el modal
 * de "Nueva Factura" para filtrar qué métodos de cobro mostrar.
 */
export async function getPaymentProvidersStatus(): Promise<{ stripe: boolean; paypal: boolean }> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("payment_provider_configs")
      .select("provider, enabled, secret_key, client_id, client_secret");
    const rows = data ?? [];
    const stripeRow = rows.find((r) => r.provider === "stripe");
    const paypalRow = rows.find((r) => r.provider === "paypal");
    const stripeFromDb = !!(stripeRow?.enabled && stripeRow.secret_key && stripeRow.secret_key.trim());
    const paypalFromDb = !!(paypalRow?.enabled && paypalRow.client_id && paypalRow.client_secret);
    // Fallback a env vars si la DB no tiene config (compat instalaciones viejas).
    const stripe = stripeFromDb || !!process.env.STRIPE_SECRET_KEY;
    const paypal = paypalFromDb || !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
    return { stripe, paypal };
  } catch {
    return { stripe: false, paypal: false };
  }
}

export async function listPaymentConfigs(): Promise<PaymentConfigRow[]> {
  const guard = await getStaffOrError();
  if (!guard.ok) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_provider_configs")
    .select("*")
    .order("provider");

  if (error) {
    console.error("[listPaymentConfigs]", error.message);
    return [];
  }
  return data ?? [];
}

// PM 2026-07-02: Stripe ahora persiste dos sets de keys (TEST + LIVE) en
// columnas separadas. El `mode` decide cuál se usa en runtime. El admin
// puede rotar el switch sin perder las keys inactivas.
const stripeSchema = z.object({
  provider: z.literal("stripe"),
  enabled: z.union([z.boolean(), z.string()]).transform((v) => typeof v === "string" ? v === "true" : v),
  mode: z.enum(["test", "live"]).default("test"),
  publishable_key_test: z.string().trim().max(300).optional().or(z.literal("")),
  secret_key_test: z.string().trim().max(300).optional().or(z.literal("")),
  webhook_secret_test: z.string().trim().max(300).optional().or(z.literal("")),
  publishable_key_live: z.string().trim().max(300).optional().or(z.literal("")),
  secret_key_live: z.string().trim().max(300).optional().or(z.literal("")),
  webhook_secret_live: z.string().trim().max(300).optional().or(z.literal("")),
  connected_account_id: z.string().trim().max(120).optional().or(z.literal("")),
  default_currency: z.string().trim().max(10).default("USD"),
});

const paypalSchema = z.object({
  provider: z.literal("paypal"),
  enabled: z.union([z.boolean(), z.string()]).transform((v) => typeof v === "string" ? v === "true" : v),
  mode: z.enum(["test", "live"]).default("test"),
  client_id: z.string().trim().max(300).optional().or(z.literal("")),
  client_secret: z.string().trim().max(300).optional().or(z.literal("")),
  account_email: z.string().trim().max(200).optional().or(z.literal("")),
  default_currency: z.string().trim().max(10).default("USD"),
});

export async function savePaymentConfig(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffOrError();
  if (!guard.ok) return guard;

  const provider = String(formData.get("provider") ?? "").trim();
  if (provider !== "stripe" && provider !== "paypal") {
    return { ok: false, error: "Provider inválido" };
  }

  let parsed;
  if (provider === "stripe") {
    parsed = stripeSchema.safeParse({
      provider: "stripe",
      enabled: formData.get("enabled") ?? "false",
      mode: formData.get("mode") ?? "test",
      publishable_key_test: formData.get("publishable_key_test") ?? "",
      secret_key_test: formData.get("secret_key_test") ?? "",
      webhook_secret_test: formData.get("webhook_secret_test") ?? "",
      publishable_key_live: formData.get("publishable_key_live") ?? "",
      secret_key_live: formData.get("secret_key_live") ?? "",
      webhook_secret_live: formData.get("webhook_secret_live") ?? "",
      connected_account_id: formData.get("connected_account_id") ?? "",
      default_currency: formData.get("default_currency") ?? "USD",
    });
  } else {
    parsed = paypalSchema.safeParse({
      provider: "paypal",
      enabled: formData.get("enabled") ?? "false",
      mode: formData.get("mode") ?? "test",
      client_id: formData.get("client_id") ?? "",
      client_secret: formData.get("client_secret") ?? "",
      account_email: formData.get("account_email") ?? "",
      default_currency: formData.get("default_currency") ?? "USD",
    });
  }
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

  const supabase = await createClient();
  const actorId = guard.current.user.id;

  // Si enabled=true, validar que al menos las keys mínimas del MODO ACTIVO
  // estén presentes. Podemos guardar keys del otro modo vacías sin bloquear.
  const d = parsed.data;
  if (d.enabled) {
    if (d.provider === "stripe") {
      const pk = d.mode === "live" ? d.publishable_key_live : d.publishable_key_test;
      const sk = d.mode === "live" ? d.secret_key_live : d.secret_key_test;
      if (!pk || !sk) {
        return {
          ok: false,
          error: `Stripe en modo ${d.mode.toUpperCase()} requiere Publishable y Secret keys. Cargá las del modo activo antes de habilitar.`,
        };
      }
    }
    if (d.provider === "paypal" && (!d.client_id || !d.client_secret)) {
      return { ok: false, error: "PayPal requiere Client ID y Client Secret para habilitar." };
    }
  }

  // PM 2026-07-02: para Stripe además espejamos las keys del modo activo a
  // las columnas legacy (publishable_key/secret_key/webhook_secret). Esto
  // mantiene compat con readers que aún no conozcan las columnas _test/_live
  // (por ejemplo, si la migración no se aplicó todavía en algún ambiente).
  let upsertPayload: Record<string, unknown> = {
    ...d,
    configured_at: d.enabled ? new Date().toISOString() : null,
    configured_by: d.enabled ? actorId : null,
  };
  if (d.provider === "stripe") {
    upsertPayload = {
      ...upsertPayload,
      publishable_key: d.mode === "live" ? d.publishable_key_live : d.publishable_key_test,
      secret_key: d.mode === "live" ? d.secret_key_live : d.secret_key_test,
      webhook_secret: d.mode === "live" ? d.webhook_secret_live : d.webhook_secret_test,
    };
  }

  const { error } = await supabase
    .from("payment_provider_configs")
    .upsert(upsertPayload as never, { onConflict: "provider" });

  if (error) return { ok: false, error: `No se pudo guardar: ${error.message}` };

  // PM 2026-06-29: invalidar el cache del provider correspondiente para
  // que la próxima request lea las nuevas keys sin esperar el TTL de 60s.
  if (provider === "stripe") {
    const { invalidateStripeCache } = await import("@/lib/stripe/client");
    invalidateStripeCache();
  } else if (provider === "paypal") {
    const { invalidatePayPalCache } = await import("@/lib/paypal/client");
    invalidatePayPalCache();
  }

  await writeAuditLog(actorId, "payment_config.save", "payment_config", provider, {
    enabled: d.enabled,
    mode: d.mode,
  });
  return { ok: true };
}
