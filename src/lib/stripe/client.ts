import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PM 2026-06-29: Stripe lee primero la tabla `payment_provider_configs`
 * (admin la edita desde Configuración → Integraciones) y solo cae al
 * env var STRIPE_SECRET_KEY si la DB no tiene una key habilitada. Antes
 * solo leía env, lo que obligaba a setear GitHub Secrets + re-deploy
 * cada vez que el cliente quería cambiar las keys. Ahora el cambio es
 * inmediato desde el admin UI — sin SSH, sin re-deploy.
 *
 * Cache de 60s para evitar martillar Supabase en cada request.
 */
let _stripe: Stripe | null = null;
let _stripeKeyCache: { key: string | null; expiresAt: number } | null = null;
const KEY_CACHE_MS = 60_000;

async function resolveStripeKey(): Promise<string | null> {
  const now = Date.now();
  if (_stripeKeyCache && _stripeKeyCache.expiresAt > now) {
    return _stripeKeyCache.key;
  }
  let key: string | null = null;
  try {
    const admin = createAdminClient();
    // PM 2026-07-02: leemos las columnas nuevas (_test/_live) + legacy
    // (secret_key) como fallback. `mode` decide qué slot usar. Si la
    // migración 20260702000000 no se aplicó aún, el select va a fallar por
    // columna faltante y caemos a un segundo intento con el shape viejo.
    let row:
      | {
          enabled: boolean | null;
          mode: string | null;
          secret_key: string | null;
          secret_key_test: string | null;
          secret_key_live: string | null;
        }
      | null = null;
    const first = await admin
      .from("payment_provider_configs")
      .select("secret_key, secret_key_test, secret_key_live, enabled, mode")
      .eq("provider", "stripe")
      .maybeSingle();
    if (first.error && String(first.error.code) === "42703") {
      const legacy = await admin
        .from("payment_provider_configs")
        .select("secret_key, enabled, mode")
        .eq("provider", "stripe")
        .maybeSingle();
      row = legacy.data
        ? { ...legacy.data, secret_key_test: null, secret_key_live: null }
        : null;
    } else {
      row = (first.data as typeof row) ?? null;
    }
    if (row?.enabled) {
      const mode = row.mode === "live" ? "live" : "test";
      const byMode = mode === "live" ? row.secret_key_live : row.secret_key_test;
      const candidate = (byMode && byMode.trim()) || (row.secret_key && row.secret_key.trim()) || "";
      if (candidate) key = candidate;
    }
  } catch {
    // best-effort: si la query falla, fallback al env.
  }
  if (!key) key = process.env.STRIPE_SECRET_KEY || null;
  _stripeKeyCache = { key, expiresAt: now + KEY_CACHE_MS };
  return key;
}

export async function getStripe(): Promise<Stripe> {
  const key = await resolveStripeKey();
  if (!key) {
    throw new Error(
      "Stripe no está configurado. Andá a Admin → Configuración → Integraciones y guardá las claves, o agregá STRIPE_SECRET_KEY al .env del server."
    );
  }
  // Re-instanciar si la key cambió (cliente la rotó desde el admin).
  if (!_stripe || (_stripe as Stripe & { __key?: string }).__key !== key) {
    _stripe = new Stripe(key, { typescript: true });
    (_stripe as Stripe & { __key?: string }).__key = key;
  }
  return _stripe;
}

export async function isStripeConfigured(): Promise<boolean> {
  const key = await resolveStripeKey();
  return Boolean(key);
}

/**
 * PM 2026-06-29: webhook secret — mismo patrón. Lee primero la tabla
 * `payment_provider_configs.webhook_secret`, fallback a env var
 * STRIPE_WEBHOOK_SECRET. El handler de /api/stripe/webhook valida la
 * firma con este secret.
 */
let _stripeWebhookSecretCache: { secret: string | null; expiresAt: number } | null = null;

/**
 * PM 2026-06-29: el admin acaba de guardar nuevas keys desde el panel.
 * Invalidamos los caches para que la próxima request use los valores
 * frescos sin esperar el TTL de 60s.
 */
export function invalidateStripeCache(): void {
  _stripeKeyCache = null;
  _stripeWebhookSecretCache = null;
  _stripe = null;
}

export async function getStripeWebhookSecret(): Promise<string | null> {
  const now = Date.now();
  if (_stripeWebhookSecretCache && _stripeWebhookSecretCache.expiresAt > now) {
    return _stripeWebhookSecretCache.secret;
  }
  let secret: string | null = null;
  try {
    const admin = createAdminClient();
    // PM 2026-07-02: mismo patrón que resolveStripeKey — leer las columnas
    // por modo + legacy como fallback. Tolerante a migración no aplicada.
    let row:
      | {
          enabled: boolean | null;
          mode: string | null;
          webhook_secret: string | null;
          webhook_secret_test: string | null;
          webhook_secret_live: string | null;
        }
      | null = null;
    const first = await admin
      .from("payment_provider_configs")
      .select("webhook_secret, webhook_secret_test, webhook_secret_live, enabled, mode")
      .eq("provider", "stripe")
      .maybeSingle();
    if (first.error && String(first.error.code) === "42703") {
      const legacy = await admin
        .from("payment_provider_configs")
        .select("webhook_secret, enabled, mode")
        .eq("provider", "stripe")
        .maybeSingle();
      row = legacy.data
        ? { ...legacy.data, webhook_secret_test: null, webhook_secret_live: null }
        : null;
    } else {
      row = (first.data as typeof row) ?? null;
    }
    if (row?.enabled) {
      const mode = row.mode === "live" ? "live" : "test";
      const byMode = mode === "live" ? row.webhook_secret_live : row.webhook_secret_test;
      const candidate = (byMode && byMode.trim()) || (row.webhook_secret && row.webhook_secret.trim()) || "";
      if (candidate) secret = candidate;
    }
  } catch {
    // best-effort: fallback al env.
  }
  if (!secret) secret = process.env.STRIPE_WEBHOOK_SECRET || null;
  _stripeWebhookSecretCache = { secret, expiresAt: now + KEY_CACHE_MS };
  return secret;
}
