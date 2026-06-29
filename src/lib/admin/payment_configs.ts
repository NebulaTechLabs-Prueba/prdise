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

const stripeSchema = z.object({
  provider: z.literal("stripe"),
  enabled: z.union([z.boolean(), z.string()]).transform((v) => typeof v === "string" ? v === "true" : v),
  mode: z.enum(["test", "live"]).default("test"),
  publishable_key: z.string().trim().max(300).optional().or(z.literal("")),
  secret_key: z.string().trim().max(300).optional().or(z.literal("")),
  webhook_secret: z.string().trim().max(300).optional().or(z.literal("")),
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
      publishable_key: formData.get("publishable_key") ?? "",
      secret_key: formData.get("secret_key") ?? "",
      webhook_secret: formData.get("webhook_secret") ?? "",
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

  // Si enabled=true, validar que al menos las keys mínimas estén presentes.
  const d = parsed.data;
  if (d.enabled) {
    if (d.provider === "stripe" && (!d.publishable_key || !d.secret_key)) {
      return { ok: false, error: "Stripe requiere Publishable y Secret keys para habilitar." };
    }
    if (d.provider === "paypal" && (!d.client_id || !d.client_secret)) {
      return { ok: false, error: "PayPal requiere Client ID y Client Secret para habilitar." };
    }
  }

  const { error } = await supabase
    .from("payment_provider_configs")
    .upsert(
      {
        ...d,
        configured_at: d.enabled ? new Date().toISOString() : null,
        configured_by: d.enabled ? actorId : null,
      },
      { onConflict: "provider" }
    );

  if (error) return { ok: false, error: `No se pudo guardar: ${error.message}` };

  await writeAuditLog(actorId, "payment_config.save", "payment_config", provider, {
    enabled: d.enabled,
    mode: d.mode,
  });
  return { ok: true };
}
